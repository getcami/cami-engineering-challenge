import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CustomerRequest } from '../requests/customer-request.entity';
import { Classification } from './classification.entity';
import {
  ClassificationHistoryPage,
  ClassificationRecord,
  ClassificationsRepository,
  HistoryFilter,
  NewClassification,
  STATUS_AFTER_FIRST_CLASSIFICATION,
} from './classifications.repository';

/** Escape LIKE/ILIKE wildcards so user text is matched literally ("50%" is not "50 anything"). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class TypeOrmClassificationsRepository extends ClassificationsRepository {
  constructor(
    @InjectRepository(Classification)
    private readonly classifications: Repository<Classification>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  requestExists(requestId: string): Promise<boolean> {
    return this.dataSource.getRepository(CustomerRequest).exists({ where: { id: requestId } });
  }

  async record(entry: NewClassification): Promise<ClassificationRecord | null> {
    const saved = await this.dataSource.transaction(async (em) => {
      if (entry.requestId) {
        // One UPDATE: the status rule is evaluated by the database at write time,
        // so a concurrent status change cannot be clobbered by a read-then-write.
        const update = await em
          .createQueryBuilder()
          .update(CustomerRequest)
          .set({
            category: entry.category,
            confidence: entry.confidence,
            status: () => 'CASE WHEN status = :promoteFrom THEN :promoteTo ELSE status END',
          })
          .where('id = :requestId', { requestId: entry.requestId })
          .setParameters({
            promoteFrom: STATUS_AFTER_FIRST_CLASSIFICATION.from,
            promoteTo: STATUS_AFTER_FIRST_CLASSIFICATION.to,
          })
          .execute();

        if (!update.affected) {
          return null; // request vanished; nothing written
        }
      }
      return em.save(em.create(Classification, entry));
    });

    return saved ? this.toRecord(saved) : null;
  }

  async findHistory(filter: HistoryFilter): Promise<ClassificationHistoryPage> {
    const qb = this.classifications
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(filter.offset)
      .take(filter.limit);

    if (filter.category) {
      qb.andWhere('c.category = :category', { category: filter.category });
    }
    if (filter.requestId) {
      qb.andWhere('c.requestId = :requestId', { requestId: filter.requestId });
    }
    if (filter.search) {
      qb.andWhere(`c.message ILIKE :search ESCAPE '\\'`, {
        search: `%${escapeLike(filter.search)}%`,
      });
    }
    if (filter.from) {
      qb.andWhere('c.createdAt >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('c.createdAt < :to', { to: filter.to });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toRecord(row)),
      total,
      limit: filter.limit,
      offset: filter.offset,
    };
  }

  private toRecord(row: Classification): ClassificationRecord {
    return {
      id: row.id,
      requestId: row.requestId,
      message: row.message,
      category: row.category,
      confidence: row.confidence,
      rawCategory: row.rawCategory,
      rawConfidence: row.rawConfidence,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
