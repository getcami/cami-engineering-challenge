export type DateRange = {
  /** ISO instant, inclusive. */
  from?: string;
  /** ISO instant, exclusive. */
  to?: string;
  /** Set when both dates are given but the range is empty or backwards. */
  invalid: boolean;
};

/** "YYYY-MM-DD" (from an <input type="date">) to local midnight, or null if blank/garbled. */
function localMidnight(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The date pickers speak in whole days, in the user's timezone; the API speaks in
 * a half-open range of instants [from, to). So "from Jan 2 to Jan 3" (both
 * inclusive days) becomes [Jan 2 00:00, Jan 4 00:00) local time: the end day is
 * included in full by moving to the *start of the following day*.
 */
export function dateRangeToInstants(fromDay: string, toDay: string): DateRange {
  const from = localMidnight(fromDay);
  const toStart = localMidnight(toDay);

  let to: Date | null = null;
  if (toStart) {
    to = new Date(toStart);
    to.setDate(to.getDate() + 1);
  }

  const invalid = Boolean(from && to && from.getTime() >= to.getTime());
  return {
    from: from?.toISOString(),
    to: to?.toISOString(),
    invalid,
  };
}
