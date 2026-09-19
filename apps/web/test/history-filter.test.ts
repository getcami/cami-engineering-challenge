import { describe, expect, it } from 'vitest';
import { dateRangeToInstants } from '@/lib/history-filter';

// Local-time midnights, exactly as the function builds them, so the test is
// timezone-independent (it holds in UTC, Dubai, or Los Angeles).
const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();

describe('dateRangeToInstants', () => {
  it('turns inclusive days into a half-open [from, to) range: the end day is included in full', () => {
    const range = dateRangeToInstants('2026-01-02', '2026-01-03');
    expect(range.from).toBe(localMidnight(2026, 1, 2));
    expect(range.to).toBe(localMidnight(2026, 1, 4)); // start of the day AFTER the "to" day
    expect(range.invalid).toBe(false);
  });

  it('a single day is a valid 24h window', () => {
    const range = dateRangeToInstants('2026-03-05', '2026-03-05');
    expect(range.from).toBe(localMidnight(2026, 3, 5));
    expect(range.to).toBe(localMidnight(2026, 3, 6));
    expect(range.invalid).toBe(false);
  });

  it('rolls over month and year ends', () => {
    expect(dateRangeToInstants('2026-12-31', '2026-12-31').to).toBe(localMidnight(2027, 1, 1));
    expect(dateRangeToInstants('2026-02-28', '2026-02-28').to).toBe(localMidnight(2026, 3, 1));
  });

  it('is open-ended when one side is blank', () => {
    expect(dateRangeToInstants('2026-01-02', '')).toEqual({ from: localMidnight(2026, 1, 2), to: undefined, invalid: false });
    expect(dateRangeToInstants('', '2026-01-02')).toEqual({ from: undefined, to: localMidnight(2026, 1, 3), invalid: false });
    expect(dateRangeToInstants('', '')).toEqual({ from: undefined, to: undefined, invalid: false });
  });

  it('flags a backwards range', () => {
    expect(dateRangeToInstants('2026-02-01', '2026-01-01').invalid).toBe(true);
  });

  it('treats garbled input as blank rather than throwing', () => {
    expect(dateRangeToInstants('yesterday', '2026-13-45')).toEqual({ from: undefined, to: undefined, invalid: false });
  });
});
