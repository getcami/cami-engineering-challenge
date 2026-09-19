import { describe, expect, it } from 'vitest';
import { KeywordClassifier } from '../src/classifications/keyword-classifier';

describe('KeywordClassifier', () => {
  const classifier = new KeywordClassifier();

  it('classifies billing messages', () => {
    const result = classifier.classify('Please fix my invoice and payment charge');
    expect(result.category).toBe('billing');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns unknown for unrelated text', () => {
    const result = classifier.classify('Hello there');
    expect(result.category).toBe('unknown');
  });
});
