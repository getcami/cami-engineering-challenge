import { ClassificationCategory } from './classifier.provider';

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

export type NewClassification = Omit<ClassificationRecord, 'id' | 'createdAt'>;

export type HistoryFilter = {
  category?: ClassificationCategory;
  requestId?: string;
  /** Case-insensitive "message contains". Plain text: the store escapes wildcards. */
  search?: string;
  /** Inclusive lower bound on when the classification ran. */
  from?: Date;
  /** Exclusive upper bound (half-open range, so consecutive days never overlap). */
  to?: Date;
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
 * Business rule: classifying a request takes it out of the untouched queue.
 * The first classification promotes `open` -> `in_progress`; any other status is
 * left alone. It is data here (not buried in SQL) so the rule is visible and
 * testable, and adapters enact it.
 */
export const STATUS_AFTER_FIRST_CLASSIFICATION = {
  from: 'open',
  to: 'in_progress',
} as const;

/**
 * Persistence port for classification history.
 *
 * `record` is deliberately one operation rather than "insert a row" plus "update
 * a request": those two writes must succeed or fail together, so the unit of
 * work belongs to the port. An adapter must implement it atomically. A naive
 * per-entity repository would push that transaction up into the service and
 * leak the storage engine back into business logic.
 */
export abstract class ClassificationsRepository {
  abstract requestExists(requestId: string): Promise<boolean>;

  /**
   * Persists the classification and, when `entry.requestId` is set, in the same
   * atomic step applies its category/confidence to that request and enacts
   * STATUS_AFTER_FIRST_CLASSIFICATION.
   *
   * Returns null, having written nothing, if `entry.requestId` refers to a
   * request that no longer exists.
   */
  abstract record(entry: NewClassification): Promise<ClassificationRecord | null>;

  /** Newest first (ties broken by id), with the total matching the filter. */
  abstract findHistory(filter: HistoryFilter): Promise<ClassificationHistoryPage>;
}
