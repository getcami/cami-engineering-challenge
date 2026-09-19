import { describe, expect, it } from 'vitest';
import {
  applyClassificationPolicy,
  assertValidProviderResult,
  InvalidProviderResultError,
  MIN_TRUSTED_CONFIDENCE,
} from '../src/classifications/classification-policy';
import { KeywordClassifier } from '../src/classifications/keyword-classifier';

describe('applyClassificationPolicy', () => {
  it('leaves a confident, multi-word result untouched', () => {
    expect(
      applyClassificationPolicy('please fix my invoice', { category: 'billing', confidence: 0.86 }),
    ).toEqual({ category: 'billing', confidence: 0.86 });
  });

  it.each([
    ['one word', 'refund'],
    ['two words', 'refund please'],
    ['padded with whitespace', '   refund   '],
  ])('damps confidence by 0.15 for a short message (%s)', (_name, message) => {
    const result = applyClassificationPolicy(message, { category: 'billing', confidence: 0.86 });
    expect(result.category).toBe('billing');
    expect(result.confidence).toBeCloseTo(0.71, 10);
  });

  it('does not damp at exactly three words', () => {
    const result = applyClassificationPolicy('refund did arrive', {
      category: 'billing',
      confidence: 0.86,
    });
    expect(result.confidence).toBe(0.86);
  });

  it('clamps damped confidence to the 0.5 floor, then demotes it (0.5 < 0.55 trust threshold)', () => {
    // 0.6 - 0.15 = 0.45 -> floored to 0.5 -> below the trust threshold -> "unknown".
    expect(applyClassificationPolicy('hi', { category: 'sales', confidence: 0.6 })).toEqual({
      category: 'unknown',
      confidence: 0.5,
    });
  });

  it('does not damp "unknown" results', () => {
    expect(applyClassificationPolicy('hello', { category: 'unknown', confidence: 0.4 })).toEqual({
      category: 'unknown',
      confidence: 0.4,
    });
  });

  it('demotes a weak result to "unknown" but keeps the confidence for transparency', () => {
    const result = applyClassificationPolicy('a long enough message here', {
      category: 'support',
      confidence: MIN_TRUSTED_CONFIDENCE - 0.01,
    });
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBeCloseTo(MIN_TRUSTED_CONFIDENCE - 0.01, 10);
  });

  it('keeps a result exactly at the trust threshold', () => {
    expect(
      applyClassificationPolicy('a long enough message here', {
        category: 'support',
        confidence: MIN_TRUSTED_CONFIDENCE,
      }).category,
    ).toBe('support');
  });

  it('does not mutate its input', () => {
    const raw = { category: 'billing' as const, confidence: 0.86 };
    applyClassificationPolicy('refund', raw);
    expect(raw).toEqual({ category: 'billing', confidence: 0.86 });
  });

  it('works end to end with the keyword provider', async () => {
    const provider = new KeywordClassifier();
    const raw = await provider.classify('Where is my refund');
    expect(applyClassificationPolicy('Where is my refund', raw)).toEqual({
      category: 'billing',
      confidence: 0.86,
    });
  });
});

describe('assertValidProviderResult (provider output is untrusted)', () => {
  it('accepts a well-formed result', () => {
    expect(assertValidProviderResult({ category: 'sales', confidence: 0.8 })).toEqual({
      category: 'sales',
      confidence: 0.8,
    });
  });

  it.each([
    ['unknown label', { category: 'spam', confidence: 0.9 }],
    ['missing category', { confidence: 0.9 }],
    ['confidence above 1', { category: 'sales', confidence: 7 }],
    ['negative confidence', { category: 'sales', confidence: -0.1 }],
    ['NaN confidence', { category: 'sales', confidence: Number.NaN }],
    ['string confidence', { category: 'sales', confidence: '0.9' }],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_name, value) => {
    expect(() => assertValidProviderResult(value)).toThrow(InvalidProviderResultError);
  });
});
