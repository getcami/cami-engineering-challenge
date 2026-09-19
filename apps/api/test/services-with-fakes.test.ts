import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ClassificationHistoryPage,
  ClassificationRecord,
  ClassificationsRepository,
  HistoryFilter,
  NewClassification,
} from '../src/classifications/classifications.repository';
import { ClassificationsService } from '../src/classifications/classifications.service';
import { ClassificationResult, ClassifierProvider } from '../src/classifications/classifier.provider';
import { escapeLike } from '../src/classifications/typeorm-classifications.repository';
import { RequestDetail, RequestListItem, RequestsRepository } from '../src/requests/requests.repository';
import { RequestsService } from '../src/requests/requests.service';
import { RequestStatus } from '../src/requests/customer-request.entity';

/**
 * These tests use in-memory fakes of the persistence ports: no database, no
 * Nest container, no TypeORM. That they can exist at all is the point of the
 * repository seam: the services hold real behaviour that is testable on its own.
 */

class FakeClassificationsRepository extends ClassificationsRepository {
  recorded: NewClassification[] = [];
  existingRequests = new Set<string>();
  /** Simulates the request being deleted between the existence check and the write. */
  vanishOnRecord = false;
  lastHistoryFilter?: HistoryFilter;

  async requestExists(id: string) {
    return this.existingRequests.has(id);
  }
  async record(entry: NewClassification): Promise<ClassificationRecord | null> {
    if (entry.requestId && this.vanishOnRecord) return null;
    this.recorded.push(entry);
    return { ...entry, id: `c-${this.recorded.length}`, createdAt: '2026-01-01T00:00:00.000Z' };
  }
  async findHistory(filter: HistoryFilter): Promise<ClassificationHistoryPage> {
    this.lastHistoryFilter = filter;
    return { items: [], total: 0, limit: filter.limit, offset: filter.offset };
  }
}

class StubProvider implements ClassifierProvider {
  name = 'stub';
  calls: string[] = [];
  result: () => ClassificationResult | Promise<ClassificationResult> = () => ({
    category: 'billing',
    confidence: 0.86,
  });
  classify(message: string) {
    this.calls.push(message);
    return this.result();
  }
}

describe('ClassificationsService (with fakes)', () => {
  const setup = () => {
    const repo = new FakeClassificationsRepository();
    const provider = new StubProvider();
    return { repo, provider, service: new ClassificationsService(provider, repo) };
  };

  it('records raw provider output alongside the policy-adjusted result', async () => {
    const { service, repo } = setup();
    const saved = await service.classify({ message: 'refund' }); // one word: damped

    expect(repo.recorded).toHaveLength(1);
    expect(repo.recorded[0]).toMatchObject({
      requestId: null,
      message: 'refund',
      category: 'billing',
      rawCategory: 'billing',
      rawConfidence: 0.86,
      provider: 'stub',
    });
    expect(repo.recorded[0].confidence).toBeCloseTo(0.71, 10);
    expect(saved.id).toBe('c-1');
  });

  it('404s on an unknown request BEFORE calling the provider (no wasted LLM call)', async () => {
    const { service, repo, provider } = setup();

    await expect(service.classify({ message: 'hello there', requestId: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(provider.calls).toEqual([]);
    expect(repo.recorded).toEqual([]);
  });

  it('passes the requestId through for a known request', async () => {
    const { service, repo } = setup();
    repo.existingRequests.add('req-1');

    await service.classify({ message: 'where is my invoice', requestId: 'req-1' });
    expect(repo.recorded[0].requestId).toBe('req-1');
  });

  it('404s if the request disappears between the check and the write', async () => {
    const { service, repo } = setup();
    repo.existingRequests.add('req-1');
    repo.vanishOnRecord = true;

    await expect(service.classify({ message: 'where is my invoice', requestId: 'req-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.recorded).toEqual([]);
  });

  it.each([
    ['throws', () => { throw new Error('timeout'); }],
    ['rejects', () => Promise.reject(new Error('429'))],
    ['returns an unknown label', () => ({ category: 'spam', confidence: 0.9 }) as never],
    ['returns confidence out of range', () => ({ category: 'sales', confidence: 2 })],
  ])('maps a provider that %s to 502 and records nothing', async (_name, result) => {
    const { service, repo, provider } = setup();
    provider.result = result as StubProvider['result'];

    await expect(service.classify({ message: 'where is my invoice' })).rejects.toBeInstanceOf(BadGatewayException);
    expect(repo.recorded).toEqual([]);
  });

  describe('history()', () => {
    it('passes the filter through to the repository', async () => {
      const { service, repo } = setup();
      const filter: HistoryFilter = { category: 'sales', search: 'demo', limit: 10, offset: 20 };
      await service.history(filter);
      expect(repo.lastHistoryFilter).toEqual(filter);
    });

    it('rejects an empty or inverted date range with 400', async () => {
      const { service } = setup();
      const at = (iso: string) => new Date(iso);
      const base = { limit: 10, offset: 0 };
      await expect(service.history({ ...base, from: at('2026-02-01'), to: at('2026-01-01') })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.history({ ...base, from: at('2026-02-01'), to: at('2026-02-01') })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.history({ ...base, from: at('2026-01-01'), to: at('2026-02-01') })).resolves.toBeDefined();
    });
  });
});

class FakeRequestsRepository extends RequestsRepository {
  rows = new Map<string, RequestDetail>();
  async listWithNoteSummary(): Promise<RequestListItem[]> {
    return [];
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(message: string): Promise<RequestDetail> {
    const row: RequestDetail = {
      id: 'new',
      message,
      status: 'open',
      category: null,
      confidence: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async updateStatus(id: string, status: RequestStatus) {
    const row = this.rows.get(id);
    if (!row) return null;
    row.status = status;
    return row;
  }
}

describe('RequestsService (with fakes)', () => {
  it('turns "not found" from the store into a 404', async () => {
    const service = new RequestsService(new FakeRequestsRepository());
    await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateStatus('nope', 'resolved')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns what the store returns when found', async () => {
    const repo = new FakeRequestsRepository();
    const service = new RequestsService(repo);
    const created = await service.create('hello');
    expect((await service.getById(created.id)).message).toBe('hello');
    expect((await service.updateStatus(created.id, 'resolved')).status).toBe('resolved');
  });
});

describe('escapeLike', () => {
  it.each([
    ['plain', 'plain'],
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
  ])('%s -> %s', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
