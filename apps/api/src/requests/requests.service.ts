import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerRequest, RequestStatus } from './customer-request.entity';
import { RequestNote } from './request-note.entity';
import { ClassificationEvent } from './classification-event.entity';

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

export type ClassificationHistoryItem = {
  id: string;
  requestId: string;
  category: string;
  confidence: number;
  messageSnapshot: string;
  createdAt: string;
};

export type ClassifyInput = {
  message: string;
  requestId?: string;
  category: string;
  confidence: number;
};

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(CustomerRequest)
    private readonly requests: Repository<CustomerRequest>,
    @InjectRepository(RequestNote)
    private readonly notes: Repository<RequestNote>,
    @InjectRepository(ClassificationEvent)
    private readonly classificationEvents: Repository<ClassificationEvent>,
  ) {}

  /**
   * Task 1 fix: replaced N+1 loop with a single LEFT JOIN query that aggregates
   * note counts and latest previews in one round-trip.
   */
  async list(): Promise<RequestListItem[]> {
    const rows = await this.requests
      .createQueryBuilder('r')
      .leftJoin(
        (qb) =>
          qb
            .select('n.request_id', 'request_id')
            .addSelect('COUNT(*)', 'note_count')
            .addSelect(
              `(array_agg(n.body ORDER BY n.created_at DESC))[1]`,
              'latest_body',
            )
            .from(RequestNote, 'n')
            .groupBy('n.request_id'),
        'agg',
        'agg.request_id = r.id',
      )
      .addSelect('COALESCE(agg.note_count, 0)', 'note_count')
      .addSelect('agg.latest_body', 'latest_body')
      .orderBy('r.created_at', 'DESC')
      .getRawMany<{
        r_id: string;
        r_message: string;
        r_status: RequestStatus;
        r_category: string | null;
        r_confidence: number | null;
        r_created_at: Date;
        r_updated_at: Date;
        note_count: string;
        latest_body: string | null;
      }>();

    return rows.map((row) => ({
      id: row.r_id,
      message: row.r_message,
      status: row.r_status,
      category: row.r_category,
      confidence: row.r_confidence,
      noteCount: parseInt(row.note_count ?? '0', 10),
      latestNotePreview: row.latest_body ?? null,
      createdAt: new Date(row.r_created_at).toISOString(),
      updatedAt: new Date(row.r_updated_at).toISOString(),
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

  async save(request: CustomerRequest): Promise<CustomerRequest> {
    return this.requests.save(request);
  }

  /**
   * Task 4 / Task 5: persist classification and update request record.
   */
  async applyClassification(input: ClassifyInput): Promise<{
    category: string;
    confidence: number;
    requestId: string | null;
  }> {
    const { message, requestId, category, confidence } = input;

    if (requestId) {
      const existing = await this.getById(requestId);
      existing.category = category;
      existing.confidence = confidence;
      if (existing.status === 'open') {
        existing.status = 'in_progress';
      }
      await this.requests.save(existing);
    }

    // Persist classification event (Task 5)
    const event = this.classificationEvents.create({
      requestId: requestId ?? undefined,
      category,
      confidence,
      messageSnapshot: message,
    });

    if (requestId) {
      await this.classificationEvents.save(event);
    }

    return { category, confidence, requestId: requestId ?? null };
  }

  /**
   * Task 5: Return classification history, optionally filtered by category.
   */
  async listHistory(category?: string): Promise<ClassificationHistoryItem[]> {
    const qb = this.classificationEvents
      .createQueryBuilder('e')
      .orderBy('e.created_at', 'DESC')
      .limit(200);

    if (category) {
      qb.where('e.category = :category', { category });
    }

    const rows = await qb.getMany();
    return rows.map((e) => ({
      id: e.id,
      requestId: e.requestId,
      category: e.category,
      confidence: e.confidence,
      messageSnapshot: e.messageSnapshot,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
