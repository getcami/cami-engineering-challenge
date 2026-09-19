import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from './customer-request.entity';
import { RequestDetail, RequestListItem, RequestsRepository } from './requests.repository';

export type { RequestDetail, RequestListItem } from './requests.repository';

/**
 * Business-level operations on customer requests. Storage lives behind
 * RequestsRepository; this class only decides *what* should happen (and that a
 * missing request is a 404).
 */
@Injectable()
export class RequestsService {
  constructor(private readonly requests: RequestsRepository) {}

  list(): Promise<RequestListItem[]> {
    return this.requests.listWithNoteSummary();
  }

  async getById(id: string): Promise<RequestDetail> {
    const row = await this.requests.findById(id);
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return row;
  }

  async updateStatus(id: string, status: RequestStatus): Promise<RequestDetail> {
    const row = await this.requests.updateStatus(id, status);
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return row;
  }

  create(message: string): Promise<RequestDetail> {
    return this.requests.create(message);
  }
}
