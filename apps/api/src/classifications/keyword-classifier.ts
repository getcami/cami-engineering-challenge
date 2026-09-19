import { Injectable } from '@nestjs/common';
import { ClassificationResult, ClassifierProvider } from './classifier.provider';

export type { ClassificationCategory, ClassificationResult } from './classifier.provider';

/**
 * Deterministic keyword classifier. This is the default ClassifierProvider; an
 * LLM-backed provider can replace it by binding a different class to
 * CLASSIFIER_PROVIDER in ClassificationsModule.
 */
@Injectable()
export class KeywordClassifier implements ClassifierProvider {
  readonly name = 'keyword-v1';

  classify(message: string): ClassificationResult {
    const text = message.toLowerCase();

    if (/bill|invoice|payment|refund|charge/.test(text)) {
      return { category: 'billing', confidence: 0.86 };
    }
    if (/buy|pricing|demo|sales|upgrade|plan/.test(text)) {
      return { category: 'sales', confidence: 0.8 };
    }
    if (/help|broken|error|issue|support|bug/.test(text)) {
      return { category: 'support', confidence: 0.78 };
    }

    return { category: 'unknown', confidence: 0.4 };
  }
}
