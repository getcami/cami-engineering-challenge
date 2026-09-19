import { RequestStatus } from './customer-request.entity';

export type RequestListItem = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteRecord = {
  id: string;
  body: string;
  authorName: string;
  requestId: string;
  createdAt: Date;
};

export type RequestDetail = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  /** Only present when the notes were loaded (getById / updateStatus). */
  notes?: NoteRecord[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Persistence port for customer requests. RequestsService depends on this
 * abstraction, not on TypeORM, so business logic can be unit-tested with an
 * in-memory fake and the storage engine can change without touching services.
 *
 * It is an abstract class (not an interface) so it doubles as the Nest injection
 * token; see TypeOrmRequestsRepository for the only adapter today.
 *
 * Contract: "not found" is a `null`, never an exception: turning it into an HTTP
 * 404 is the service's job, not the store's.
 */
export abstract class RequestsRepository {
  /** All requests, newest first, with note count and latest note in one round trip. */
  abstract listWithNoteSummary(): Promise<RequestListItem[]>;

  abstract findById(id: string): Promise<RequestDetail | null>;

  abstract create(message: string): Promise<RequestDetail>;

  /** Returns the updated request, or null if it does not exist. */
  abstract updateStatus(id: string, status: RequestStatus): Promise<RequestDetail | null>;
}
