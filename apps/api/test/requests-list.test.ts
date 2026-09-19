import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, HAS_DATABASE, TestApp } from './support/test-app';

type ListItem = {
  id: string;
  message: string;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: string;
};

describe.skipIf(!HAS_DATABASE)('GET /requests (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function insertRequest(message: string, createdAt: string): Promise<string> {
    const [row] = await t.dataSource.query(
      `INSERT INTO customer_requests (message, created_at, updated_at)
       VALUES ($1, $2, $2) RETURNING id`,
      [message, createdAt],
    );
    return row.id;
  }

  async function insertNote(requestId: string, body: string, createdAt: string) {
    await t.dataSource.query(
      `INSERT INTO request_notes (request_id, body, author_name, created_at)
       VALUES ($1, $2, 'Alex', $3)`,
      [requestId, body, createdAt],
    );
  }

  it('returns newest first with correct note count and latest note per request', async () => {
    await t.dataSource.query('TRUNCATE customer_requests CASCADE');

    const oldest = await insertRequest('oldest, no notes', '2026-01-01T00:00:00Z');
    const middle = await insertRequest('middle, three notes', '2026-01-02T00:00:00Z');
    const newest = await insertRequest('newest, one note', '2026-01-03T00:00:00Z');

    // Inserted out of order on purpose: "latest" must be by created_at, not insertion.
    await insertNote(middle, 'second', '2026-01-02T01:00:00Z');
    await insertNote(middle, 'third (latest)', '2026-01-02T02:00:00Z');
    await insertNote(middle, 'first', '2026-01-02T00:30:00Z');
    await insertNote(newest, 'only note', '2026-01-03T00:10:00Z');

    const res = await request(t.app.getHttpServer()).get('/requests').expect(200);
    const items: ListItem[] = res.body;

    expect(items.map((i) => i.id)).toEqual([newest, middle, oldest]);
    expect(items.map((i) => [i.noteCount, i.latestNotePreview])).toEqual([
      [1, 'only note'],
      [3, 'third (latest)'],
      [0, null],
    ]);
    // noteCount must be a number, not a pg bigint string.
    expect(typeof items[0].noteCount).toBe('number');
    expect(items[0].createdAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('breaks created_at ties deterministically (by id)', async () => {
    await t.dataSource.query('TRUNCATE customer_requests CASCADE');
    const sameInstant = '2026-02-01T00:00:00Z';
    const ids = [
      await insertRequest('a', sameInstant),
      await insertRequest('b', sameInstant),
      await insertRequest('c', sameInstant),
    ];
    const noteInstant = '2026-02-01T01:00:00Z';
    await insertNote(ids[0], 'note-1', noteInstant);
    await insertNote(ids[0], 'note-2', noteInstant);

    const first = (await request(t.app.getHttpServer()).get('/requests').expect(200)).body as ListItem[];
    const second = (await request(t.app.getHttpServer()).get('/requests').expect(200)).body as ListItem[];

    // Requests sharing a timestamp are ordered by id descending.
    expect(first.map((i) => i.id)).toEqual([...ids].sort().reverse());
    expect(second).toEqual(first);

    // Notes sharing a timestamp: the "latest" is the one with the highest id.
    const [expected] = await t.dataSource.query(
      `SELECT body FROM request_notes WHERE request_id = $1 ORDER BY id DESC LIMIT 1`,
      [ids[0]],
    );
    expect(first.find((i) => i.id === ids[0])?.latestNotePreview).toBe(expected.body);
  });

  it('issues a single query regardless of how many requests/notes exist (no N+1)', async () => {
    await t.dataSource.query('TRUNCATE customer_requests CASCADE');
    await t.dataSource.query(`
      INSERT INTO customer_requests (message, created_at, updated_at)
      SELECT 'req ' || g, now() - (g || ' minutes')::interval, now() FROM generate_series(1, 150) g
    `);
    await t.dataSource.query(`
      INSERT INTO request_notes (request_id, body, author_name)
      SELECT id, 'note ' || n, 'Sam' FROM customer_requests, generate_series(1, 4) n
    `);

    t.resetQueryLog();
    const res = await request(t.app.getHttpServer()).get('/requests').expect(200);

    expect(res.body).toHaveLength(150);
    expect((res.body as ListItem[]).every((i) => i.noteCount === 4)).toBe(true);
    // The original implementation issued 1 + 150 queries here.
    expect(t.queryLog()).toHaveLength(1);
  });

  it('is not shadowed by :id routes ("history" is a route, not an id)', async () => {
    await request(t.app.getHttpServer()).get('/requests/history').expect(200);
    await request(t.app.getHttpServer()).get('/requests/not-a-uuid').expect(400);
  });
});
