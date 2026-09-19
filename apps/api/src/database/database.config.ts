import { CustomerRequest } from '../requests/customer-request.entity';
import { RequestNote } from '../requests/request-note.entity';
import { InitialSchema1710000000000 } from '../migrations/1710000000000-InitialSchema';
import { ListPerformanceIndexes1710000000001 } from '../migrations/1710000000001-ListPerformanceIndexes';

/**
 * Single source of truth for the entity and migration lists. The Nest runtime
 * (AppModule) and the standalone CLI DataSource (migrations/seed) both import
 * from here, so a new entity or migration cannot be registered in one place
 * and forgotten in the other.
 */
export const ENTITIES = [CustomerRequest, RequestNote];

export const MIGRATIONS = [
  InitialSchema1710000000000,
  ListPerformanceIndexes1710000000001,
];

export const DEFAULT_DATABASE_URL = 'postgres://cami:cami@localhost:5432/cami';

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

/**
 * Per-query logging is opt-in. Logging every statement to stdout is itself a
 * cost on hot paths, and it drowned out the N+1 that was hiding in the list
 * endpoint. Set DB_LOGGING=true to get it back when debugging.
 */
export function loggingOptions(): ('query' | 'error' | 'warn')[] {
  return process.env.DB_LOGGING === 'true' ? ['query', 'error', 'warn'] : ['error', 'warn'];
}
