import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerRequest, RequestStatus } from './customer-request.entity';

export type RequestListItem = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequestListRow = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One statement for the whole list. The previous implementation issued one
 * `request_notes` query per request (1 + N round trips). Here the note count and
 * the latest note are correlated subqueries, resolved inside Postgres from
 * idx_request_notes_request_id_created_at (see ListPerformanceIndexes migration),
 * so the cost no longer includes N network round trips and no notes are
 * materialised in Node just to be counted.
 *
 * Ordering has an `id` tie-breaker so equal timestamps sort deterministically,
 * and the note ordering matches the index (created_at DESC, id DESC).
 */
const LIST_SQL = `
  SELECT
    r.id,
    r.message,
    r.status,
    r.category,
    r.confidence,
    r.created_at AS "createdAt",
    r.updated_at AS "updatedAt",
    (SELECT count(*)::int FROM request_notes n WHERE n.request_id = r.id) AS "noteCount",
    (
      SELECT n.body
      FROM request_notes n
      WHERE n.request_id = r.id
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1
    ) AS "latestNotePreview"
  FROM customer_requests r
  ORDER BY r.created_at DESC, r.id DESC
`;

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(CustomerRequest)
    private readonly requests: Repository<CustomerRequest>,
  ) {}

  async list(): Promise<RequestListItem[]> {
    const rows: RequestListRow[] = await this.requests.query(LIST_SQL);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getById(id: string): Promise<CustomerRequest> {
    const row = await this.requests.findOne({
      where: { id },
      relations: { notes: true },
    });
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return row;
  }

  async updateStatus(id: string, status: RequestStatus): Promise<CustomerRequest> {
    const row = await this.getById(id);
    row.status = status;
    return this.requests.save(row);
  }

  async create(message: string): Promise<CustomerRequest> {
    const row = this.requests.create({
      message,
      status: 'open',
      category: null,
      confidence: null,
    });
    return this.requests.save(row);
  }
}
