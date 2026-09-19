import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { applyClassificationPolicy, assertValidProviderResult } from './classification-policy';
import {
  ClassificationHistoryPage,
  ClassificationRecord,
  ClassificationsRepository,
  HistoryFilter,
} from './classifications.repository';
import {
  CLASSIFIER_PROVIDER,
  ClassificationResult,
  ClassifierProvider,
} from './classifier.provider';

export type {
  ClassificationHistoryPage,
  ClassificationRecord,
} from './classifications.repository';

/**
 * Orchestrates one classification: validate the target, ask the provider,
 * apply policy, persist. It knows nothing about SQL or TypeORM; storage is
 * behind ClassificationsRepository and the model behind ClassifierProvider.
 */
@Injectable()
export class ClassificationsService {
  private readonly logger = new Logger(ClassificationsService.name);

  constructor(
    @Inject(CLASSIFIER_PROVIDER) private readonly provider: ClassifierProvider,
    private readonly repository: ClassificationsRepository,
  ) {}

  /**
   * Classify a message, persist the result to history and, when a requestId is
   * given, apply it to that request (atomically, see ClassificationsRepository.record).
   *
   * `message` is expected to be already validated and trimmed (ClassifyRequestDto).
   */
  async classify(input: { message: string; requestId?: string }): Promise<ClassificationRecord> {
    const { message, requestId } = input;

    // Fail fast on a bad id before paying for a (possibly remote) provider call.
    if (requestId && !(await this.repository.requestExists(requestId))) {
      throw new NotFoundException(`Request ${requestId} not found`);
    }

    const raw = await this.runProvider(message);
    const final = applyClassificationPolicy(message, raw);

    const saved = await this.repository.record({
      requestId: requestId ?? null,
      message,
      category: final.category,
      confidence: final.confidence,
      rawCategory: raw.category,
      rawConfidence: raw.confidence,
      provider: this.provider.name,
    });

    if (!saved) {
      // Deleted between the existence check and the write.
      throw new NotFoundException(`Request ${requestId} not found`);
    }
    return saved;
  }

  async history(filter: HistoryFilter): Promise<ClassificationHistoryPage> {
    return this.repository.findHistory(filter);
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
}
