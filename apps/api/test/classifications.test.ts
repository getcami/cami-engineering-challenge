import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClassificationResult,
  ClassifierProvider,
} from '../src/classifications/classifier.provider';
import { createTestApp, HAS_DATABASE, TestApp } from './support/test-app';

/** Provider whose behaviour each test scripts, standing in for a future LLM. */
class ScriptedProvider implements ClassifierProvider {
  name = 'scripted-test';
  next: () => ClassificationResult | Promise<ClassificationResult> = () => ({
    category: 'billing',
    confidence: 0.9,
  });
  classify() {
    return this.next();
  }
}

const NIL_UUID = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!HAS_DATABASE)('classification (integration)', () => {
  const provider = new ScriptedProvider();
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp({ provider });
    http = request(t.app.getHttpServer());
  });
  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await t.dataSource.query('TRUNCATE customer_requests, classifications CASCADE');
    provider.next = () => ({ category: 'billing', confidence: 0.9 });
  });

  const createRequest = async (message = 'please look at my invoice', status = 'open') => {
    const [row] = await t.dataSource.query(
      `INSERT INTO customer_requests (message, status) VALUES ($1, $2) RETURNING id`,
      [message, status],
    );
    return row.id as string;
  };
  const requestRow = async (id: string) =>
    (await t.dataSource.query(`SELECT status, category, confidence FROM customer_requests WHERE id = $1`, [id]))[0];
  const historyCount = async () =>
    (await t.dataSource.query(`SELECT count(*)::int AS n FROM classifications`))[0].n as number;

  describe('POST /requests/classify', () => {
    it.each([
      ['missing body', {}],
      ['blank message', { message: '   ' }],
      ['non-string message', { message: 42 }],
      ['message over 2000 chars', { message: 'x'.repeat(2001) }],
      ['malformed requestId', { message: 'hello there', requestId: 'not-a-uuid' }],
      ['unknown property', { message: 'hello there', extra: true }],
    ])('rejects %s with 400 and persists nothing', async (_name, body) => {
      await http.post('/requests/classify').send(body).expect(400);
      expect(await historyCount()).toBe(0);
    });

    it('accepts a 2000 character message (boundary)', async () => {
      await http
        .post('/requests/classify')
        .send({ message: 'x'.repeat(2000) })
        .expect(201);
    });

    it('returns 404 for an unknown requestId, without calling the provider or persisting', async () => {
      let calls = 0;
      provider.next = () => {
        calls += 1;
        return { category: 'billing', confidence: 0.9 };
      };
      await http.post('/requests/classify').send({ message: 'hello there', requestId: NIL_UUID }).expect(404);
      expect(calls).toBe(0);
      expect(await historyCount()).toBe(0);
    });

    it('classifies a linked request: records history, updates category/confidence, promotes open -> in_progress', async () => {
      const id = await createRequest();
      const res = await http
        .post('/requests/classify')
        .send({ message: '  where is my invoice please  ', requestId: id })
        .expect(201);

      expect(res.body).toMatchObject({
        requestId: id,
        message: 'where is my invoice please', // trimmed
        category: 'billing',
        confidence: 0.9,
        rawCategory: 'billing',
        rawConfidence: 0.9,
        provider: 'scripted-test',
      });
      expect(res.body.id).toEqual(expect.any(String));

      expect(await requestRow(id)).toEqual({ status: 'in_progress', category: 'billing', confidence: 0.9 });
      expect(await historyCount()).toBe(1);
    });

    it.each(['in_progress', 'resolved'])('does not change status when the request is already %s', async (status) => {
      const id = await createRequest('please look at my invoice', status);
      await http.post('/requests/classify').send({ message: 'where is my invoice', requestId: id }).expect(201);
      expect((await requestRow(id)).status).toBe(status);
    });

    it('applies the short-message policy and records both raw and final values', async () => {
      provider.next = () => ({ category: 'billing', confidence: 0.86 });
      const res = await http.post('/requests/classify').send({ message: 'refund' }).expect(201);

      expect(res.body.rawConfidence).toBe(0.86);
      expect(res.body.confidence).toBeCloseTo(0.71, 10);
      expect(res.body.category).toBe('billing');
    });

    it('records an ad-hoc classification (no requestId) without touching any request', async () => {
      const id = await createRequest();
      const res = await http.post('/requests/classify').send({ message: 'hello there friend' }).expect(201);

      expect(res.body.requestId).toBeNull();
      expect(await historyCount()).toBe(1);
      expect(await requestRow(id)).toEqual({ status: 'open', category: null, confidence: null });
    });

    it('is atomic: if recording the history row fails, the request update is rolled back too', async () => {
      const id = await createRequest();
      await t.dataSource.query(`
        CREATE FUNCTION fail_classification_insert() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'simulated insert failure'; END $$ LANGUAGE plpgsql
      `);
      await t.dataSource.query(`
        CREATE TRIGGER fail_before_insert BEFORE INSERT ON classifications
        FOR EACH ROW EXECUTE FUNCTION fail_classification_insert()
      `);
      try {
        await http.post('/requests/classify').send({ message: 'where is my invoice', requestId: id }).expect(500);
        // The UPDATE ran before the failing INSERT; it must not have survived.
        expect(await requestRow(id)).toEqual({ status: 'open', category: null, confidence: null });
        expect(await historyCount()).toBe(0);
      } finally {
        await t.dataSource.query(`DROP TRIGGER fail_before_insert ON classifications`);
        await t.dataSource.query(`DROP FUNCTION fail_classification_insert()`);
      }
    });

    describe('when the provider misbehaves (future LLM failure modes)', () => {
      it.each([
        ['throws', () => { throw new Error('upstream timeout'); }],
        ['rejects', () => Promise.reject(new Error('rate limited'))],
        ['returns an unknown label', () => ({ category: 'spam', confidence: 0.9 }) as never],
        ['returns confidence > 1', () => ({ category: 'sales', confidence: 7 })],
      ])('%s -> 502, nothing persisted, request untouched', async (_name, next) => {
        const id = await createRequest();
        provider.next = next as ScriptedProvider['next'];

        await http.post('/requests/classify').send({ message: 'where is my invoice', requestId: id }).expect(502);

        expect(await historyCount()).toBe(0);
        expect(await requestRow(id)).toEqual({ status: 'open', category: null, confidence: null });
      });
    });
  });

  describe('GET /requests/history', () => {
    const classify = (message: string, category: 'billing' | 'sales' | 'support' | 'unknown', requestId?: string) => {
      provider.next = () => ({ category, confidence: 0.9 });
      return http.post('/requests/classify').send({ message, requestId }).expect(201);
    };

    it('is empty to begin with', async () => {
      const res = await http.get('/requests/history').expect(200);
      expect(res.body).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
    });

    it('lists newest first', async () => {
      await classify('first message here', 'billing');
      await classify('second message here', 'sales');
      await classify('third message here', 'support');

      const res = await http.get('/requests/history').expect(200);
      expect(res.body.items.map((i: { message: string }) => i.message)).toEqual([
        'third message here',
        'second message here',
        'first message here',
      ]);
      expect(res.body.total).toBe(3);
    });

    it('filters by category and reports the filtered total', async () => {
      await classify('an invoice question', 'billing');
      await classify('another invoice question', 'billing');
      await classify('pricing please', 'sales');

      const res = await http.get('/requests/history?category=billing').expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((i: { category: string }) => i.category === 'billing')).toBe(true);
    });

    it('filters by requestId', async () => {
      const a = await createRequest('request A');
      const b = await createRequest('request B');
      await classify('for A once', 'billing', a);
      await classify('for A twice', 'billing', a);
      await classify('for B once', 'sales', b);

      const res = await http.get(`/requests/history?requestId=${a}`).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((i: { requestId: string }) => i.requestId === a)).toBe(true);
    });

    it('combines filters', async () => {
      const a = await createRequest('request A');
      await classify('for A billing', 'billing', a);
      await classify('for A sales', 'sales', a);

      const res = await http.get(`/requests/history?requestId=${a}&category=sales`).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].message).toBe('for A sales');
    });

    it('paginates with limit/offset without gaps or repeats', async () => {
      for (let i = 1; i <= 5; i += 1) {
        await classify(`message number ${i}`, 'billing');
      }
      const page = async (offset: number) =>
        (await http.get(`/requests/history?limit=2&offset=${offset}`).expect(200)).body;

      const [p1, p2, p3] = [await page(0), await page(2), await page(4)];
      expect(p1.total).toBe(5);
      expect([p1, p2, p3].map((p) => p.items.length)).toEqual([2, 2, 1]);

      const messages = [...p1.items, ...p2.items, ...p3.items].map((i: { message: string }) => i.message);
      expect(messages).toEqual([5, 4, 3, 2, 1].map((n) => `message number ${n}`));
    });

    describe('search and date-range filters', () => {
      const messagesFor = async (qs: string) =>
        ((await http.get(`/requests/history${qs}`).expect(200)).body.items as { message: string }[]).map(
          (i) => i.message,
        );
      const backdate = (message: string, iso: string) =>
        t.dataSource.query(`UPDATE classifications SET created_at = $2 WHERE message = $1`, [message, iso]);

      it('search is case-insensitive "contains"', async () => {
        await classify('Please send the Invoice', 'billing');
        await classify('Interested in a demo', 'sales');

        expect(await messagesFor('?search=invoice')).toEqual(['Please send the Invoice']);
        expect(await messagesFor('?search=INTERESTED')).toEqual(['Interested in a demo']);
        expect(await messagesFor('?search=nothing-matches')).toEqual([]);
      });

      it('treats % and _ in the search text literally, not as wildcards', async () => {
        await classify('Discount of 50% applied', 'billing');
        await classify('Discount of 50 dollars applied', 'billing');
        await classify('File name is a_b.txt', 'support');
        await classify('File name is aXb.txt', 'support');

        expect(await messagesFor('?search=50%25')).toEqual(['Discount of 50% applied']); // %25 = "%"
        expect(await messagesFor('?search=a_b')).toEqual(['File name is a_b.txt']);
      });

      it('ignores a blank search', async () => {
        await classify('one message here', 'billing');
        expect(await messagesFor('?search=%20%20')).toEqual(['one message here']);
      });

      it('combines search with category', async () => {
        await classify('invoice question', 'billing');
        await classify('invoice for sales', 'sales');
        expect(await messagesFor('?search=invoice&category=sales')).toEqual(['invoice for sales']);
      });

      it('from is inclusive and to is exclusive (half-open range)', async () => {
        await classify('jan 1st', 'billing');
        await classify('jan 2nd', 'billing');
        await classify('jan 3rd', 'billing');
        await backdate('jan 1st', '2026-01-01T00:00:00Z');
        await backdate('jan 2nd', '2026-01-02T00:00:00Z');
        await backdate('jan 3rd', '2026-01-03T00:00:00Z');

        // [Jan 2, Jan 3): includes the 2nd, excludes the 3rd.
        expect(await messagesFor('?from=2026-01-02T00:00:00Z&to=2026-01-03T00:00:00Z')).toEqual(['jan 2nd']);
        // Open-ended on either side.
        expect(await messagesFor('?from=2026-01-02T00:00:00Z')).toEqual(['jan 3rd', 'jan 2nd']);
        expect(await messagesFor('?to=2026-01-02T00:00:00Z')).toEqual(['jan 1st']);
      });

      it('reports total for the filtered set, independent of the page size', async () => {
        for (let i = 1; i <= 3; i += 1) await classify(`match number ${i}`, 'billing');
        await classify('something else entirely', 'billing');

        const res = await http.get('/requests/history?search=match&limit=2').expect(200);
        expect(res.body.total).toBe(3);
        expect(res.body.items).toHaveLength(2);
      });

      it.each([
        ['from after to', '?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z'],
        ['from equal to to', '?from=2026-02-01T00:00:00Z&to=2026-02-01T00:00:00Z'],
        ['unparseable from', '?from=yesterday'],
        ['unparseable to', '?to=not-a-date'],
        ['search over 200 characters', `?search=${'x'.repeat(201)}`],
      ])('rejects %s with 400', async (_name, qs) => {
        await http.get(`/requests/history${qs}`).expect(400);
      });
    });

    it('keeps history rows when the source request is deleted (FK SET NULL)', async () => {
      const id = await createRequest();
      await classify('linked then deleted', 'billing', id);
      await t.dataSource.query('DELETE FROM customer_requests WHERE id = $1', [id]);

      const res = await http.get('/requests/history').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].requestId).toBeNull();
    });

    it.each([
      ['unknown category', '?category=nope'],
      ['limit too large', '?limit=201'],
      ['limit zero', '?limit=0'],
      ['negative offset', '?offset=-1'],
      ['non-numeric limit', '?limit=abc'],
      ['malformed requestId', '?requestId=nope'],
    ])('rejects %s with 400', async (_name, qs) => {
      await http.get(`/requests/history${qs}`).expect(400);
    });
  });

  describe('other write endpoints validate input (were `{ error }` with 200 before)', () => {
    it('POST /requests rejects a blank message and accepts a valid one', async () => {
      await http.post('/requests').send({ message: '   ' }).expect(400);
      await http.post('/requests').send({}).expect(400);
      const res = await http.post('/requests').send({ message: '  new request  ' }).expect(201);
      expect(res.body.message).toBe('new request');
      expect(res.body.status).toBe('open');
    });

    it('PATCH /requests/:id/status rejects unknown statuses and updates valid ones', async () => {
      const id = await createRequest();
      await http.patch(`/requests/${id}/status`).send({ status: 'bogus' }).expect(400);
      await http.patch(`/requests/${id}/status`).send({}).expect(400);
      await http.patch('/requests/not-a-uuid/status').send({ status: 'resolved' }).expect(400);
      await http.patch(`/requests/${NIL_UUID}/status`).send({ status: 'resolved' }).expect(404);

      await http.patch(`/requests/${id}/status`).send({ status: 'resolved' }).expect(200);
      expect((await requestRow(id)).status).toBe('resolved');
    });
  });
});
