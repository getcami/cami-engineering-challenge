import type { QueryClient } from '@tanstack/react-query';
import type { RequestListItem, RequestStatus } from './api';

/**
 * One place that owns the query keys and the rules for keeping the cache honest
 * after a write. The staleness bug was that status/classify mutations succeeded
 * server-side but nothing told TanStack Query the cached lists were out of date.
 */
export const queryKeys = {
  requests: ['requests'] as const,
  // Prefix key: invalidating it covers every filter/page variant under it.
  history: ['history'] as const,
};

/**
 * Any write that changes what the request table or the classification history
 * shows must call this. Invalidating (rather than patching) is the source of
 * truth: the server decides the final values (e.g. classify also promotes
 * open -> in_progress).
 */
export function invalidateRequestData(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.requests }),
    client.invalidateQueries({ queryKey: queryKeys.history }),
  ]);
}

/** Pure: returns a new list with one row's status changed. Used for optimistic UI. */
export function withStatus(
  list: RequestListItem[] | undefined,
  id: string,
  status: RequestStatus,
): RequestListItem[] | undefined {
  if (!list) return list;
  return list.map((row) => (row.id === id ? { ...row, status } : row));
}
