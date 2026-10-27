import { ClassificationResult } from './keyword-classifier';

/**
 * Provider interface for classification.
 * The current implementation is keyword-based; a future implementation may use an LLM.
 */
export interface IClassifierProvider {
    classify(message: string): ClassificationResult | Promise<ClassificationResult>;
}

export const CLASSIFIER_PROVIDER = Symbol('IClassifierProvider');
