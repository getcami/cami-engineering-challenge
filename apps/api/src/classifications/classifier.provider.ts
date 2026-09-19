export const CLASSIFICATION_CATEGORIES = ['support', 'sales', 'billing', 'unknown'] as const;
export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];

export type ClassificationResult = {
  category: ClassificationCategory;
  /** 0..1 */
  confidence: number;
};

/**
 * Port for anything that can turn a customer message into a category.
 *
 * Today the only implementation is the deterministic KeywordClassifier. The
 * contract is deliberately shaped so an LLM-backed provider can be dropped in
 * without touching callers:
 *
 * - `classify` may be async (sync implementations are still valid).
 * - It may throw. The service treats a throw as "provider unavailable" and does
 *   not persist anything (see ClassificationsService).
 * - Its output is untrusted. The service validates it before use, because a model
 *   can return an unknown label or an out-of-range confidence.
 * - `name` is persisted with every classification, so history stays attributable
 *   when providers or model versions change (e.g. `llm:some-model@2026-01`).
 *
 * Business rules that should hold regardless of provider (short-message damping,
 * the "unknown below threshold" rule) are NOT part of a provider; they live in
 * `applyClassificationPolicy`.
 */
export interface ClassifierProvider {
  readonly name: string;
  classify(message: string): ClassificationResult | Promise<ClassificationResult>;
}

/** Nest injection token for the active ClassifierProvider. */
export const CLASSIFIER_PROVIDER = Symbol('CLASSIFIER_PROVIDER');
