import {
  CLASSIFICATION_CATEGORIES,
  ClassificationCategory,
  ClassificationResult,
} from './classifier.provider';

/** Messages with fewer words than this get their confidence damped. */
export const SHORT_MESSAGE_WORD_LIMIT = 3;
export const SHORT_MESSAGE_CONFIDENCE_PENALTY = 0.15;
export const SHORT_MESSAGE_CONFIDENCE_FLOOR = 0.5;
/** Below this confidence the category is not trusted and becomes "unknown". */
export const MIN_TRUSTED_CONFIDENCE = 0.55;

/**
 * Provider-agnostic business rules applied to a raw provider result. These used
 * to be inlined in the controller; they are pure so they can be tested without
 * Nest or a database, and so they hold for any ClassifierProvider.
 *
 * 1. Very short messages carry little signal: damp the confidence (never below
 *    the floor). "unknown" is left alone, there is nothing to damp.
 * 2. Weak results are not trusted: below the threshold the category becomes
 *    "unknown" while the confidence is kept for transparency.
 */
export function applyClassificationPolicy(
  message: string,
  raw: ClassificationResult,
): ClassificationResult {
  let result: ClassificationResult = { ...raw };

  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < SHORT_MESSAGE_WORD_LIMIT && result.category !== 'unknown') {
    result = {
      category: result.category,
      confidence: Math.max(
        SHORT_MESSAGE_CONFIDENCE_FLOOR,
        result.confidence - SHORT_MESSAGE_CONFIDENCE_PENALTY,
      ),
    };
  }

  if (result.confidence < MIN_TRUSTED_CONFIDENCE) {
    result = { category: 'unknown', confidence: result.confidence };
  }

  return result;
}

export class InvalidProviderResultError extends Error {}

/**
 * Provider output is untrusted (a model can hallucinate a label or return a
 * confidence of 7). Reject anything outside the contract rather than persisting it.
 */
export function assertValidProviderResult(value: unknown): ClassificationResult {
  const candidate = value as Partial<ClassificationResult> | null | undefined;
  const category = candidate?.category;
  const confidence = candidate?.confidence;

  if (
    typeof category !== 'string' ||
    !(CLASSIFICATION_CATEGORIES as readonly string[]).includes(category)
  ) {
    throw new InvalidProviderResultError(`Unknown category: ${String(category)}`);
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new InvalidProviderResultError(`Confidence out of range: ${String(confidence)}`);
  }

  return { category: category as ClassificationCategory, confidence };
}
