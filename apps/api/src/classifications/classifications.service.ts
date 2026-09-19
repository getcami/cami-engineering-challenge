import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CustomerRequest } from '../requests/customer-request.entity';
import { Classification } from './classification.entity';
import { applyClassificationPolicy, assertValidProviderResult } from './classification-policy';
import {
  CLASSIFIER_PROVIDER,
  ClassificationCategory,
  ClassificationResult,
  ClassifierProvider,
} from './classifier.provider';

export type ClassificationRecord = {
  id: string;
  requestId: string | null;
  message: string;
  category: ClassificationCategory;
  confidence: number;
  rawCategory: ClassificationCategory;
  rawConfidence: number;
  provider: string;
  createdAt: string;
};

export type HistoryFilter = {
  category?: ClassificationCategory;
  requestId?: string;
  limit: number;
  offset: number;
};

export type ClassificationHistoryPage = {
  items: ClassificationRecord[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Orchestrates one classification: validate the target, ask the provider,
 * apply policy, persist. The controller only parses HTTP; the rules live here
 * and in the pure `applyClassificationPolicy`.
 */
@Injectable()
export class ClassificationsService {
  private readonly logger = new Logger(ClassificationsService.name);

  constructor(
    @Inject(CLASSIFIER_PROVIDER) private readonly provider: ClassifierProvider,
    @InjectRepository(Classification)
    private readonly classifications: Repository<Classification>,
    @InjectRepository(CustomerRequest)
    private readonly requests: Repository<CustomerRequest>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Classify a message, persist the result to history and, when a requestId is
   * given, apply it to that request in the same transaction.
   *
   * `message` is expected to be already validated and trimmed (ClassifyRequestDto).
   */
  async classify(input: { message: string; requestId?: string }): Promise<ClassificationRecord> {
    const { message, requestId } = input;

    // Fail fast on a bad id before paying for a (possibly remote) provider call.
    if (requestId && !(await this.requests.exists({ where: { id: requestId } }))) {
      throw new NotFoundException(`Request ${requestId} not found`);
    }

    const raw = await this.runProvider(message);
    const final = applyClassificationPolicy(message, raw);

    const saved = await this.dataSource.transaction(async (em) => {
      if (requestId) {
        // One UPDATE: the status rule is evaluated by the database at write time,
        // so a concurrent status change cannot be clobbered by a read-then-write.
        const update = await em
          .createQueryBuilder()
          .update(CustomerRequest)
          .set({
            category: final.category,
            confidence: final.confidence,
            status: () => `CASE WHEN status = 'open' THEN 'in_progress' ELSE status END`,
          })
          .where('id = :requestId', { requestId })
          .execute();

        if (!update.affected) {
          return null; // deleted between the existence check and the write
        }
      }
      return em.save(
        em.create(Classification, {
          requestId: requestId ?? null,
          message,
          category: final.category,
          confidence: final.confidence,
          rawCategory: raw.category,
          rawConfidence: raw.confidence,
          provider: this.provider.name,
        }),
      );
    });

    if (!saved) {
      throw new NotFoundException(`Request ${requestId} not found`);
    }
    return this.toRecord(saved);
  }

  async history(filter: HistoryFilter): Promise<ClassificationHistoryPage> {
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

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toRecord(row)),
      total,
      limit: filter.limit,
      offset: filter.offset,
    };
  }

  /**
   * Provider failure modes (relevant once the provider is remote/an LLM):
   * a throw/timeout or a malformed answer both surface as 502 and persist
   * nothing, so history never contains a classification we do not trust.
   * There is intentionally no silent fallback to keywords here: that would put
   * two different classifiers' output in one history, indistinguishable to
   * users. If a fallback is wanted it should be an explicit, recorded provider
   * (see DECISIONS.md).
   */
  private async runProvider(message: string): Promise<ClassificationResult> {
    try {
      return assertValidProviderResult(await this.provider.classify(message));
    } catch (error) {
      this.logger.error(
        `Classifier provider "${this.provider.name}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadGatewayException('Classifier provider is unavailable or returned an invalid result');
    }
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
