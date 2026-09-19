import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { RequestListItem } from '@/lib/api';
import { invalidateRequestData, queryKeys, withStatus } from '@/lib/request-cache';

const row = (id: string, status: RequestListItem['status'] = 'open'): RequestListItem => ({
  id,
  message: `message ${id}`,
  status,
  category: null,
  confidence: null,
  noteCount: 0,
  latestNotePreview: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('invalidateRequestData (the "stale table" fix)', () => {
  it('marks the request list and every history variant stale, and nothing else', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.requests, [row('a')]);
    client.setQueryData([...queryKeys.history, { category: undefined, limit: 20, offset: 0 }], { items: [] });
    client.setQueryData([...queryKeys.history, { category: 'billing', limit: 20, offset: 40 }], { items: [] });
    client.setQueryData(['unrelated'], 'keep');

    // Nothing is stale before a write...
    expect(client.getQueryCache().getAll().some((q) => q.state.isInvalidated)).toBe(false);

    await invalidateRequestData(client);

    const invalidated = (key: readonly unknown[]) =>
      client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;
    expect(invalidated(queryKeys.requests)).toBe(true);
    expect(invalidated([...queryKeys.history, { category: undefined, limit: 20, offset: 0 }])).toBe(true);
    expect(invalidated([...queryKeys.history, { category: 'billing', limit: 20, offset: 40 }])).toBe(true);
    expect(invalidated(['unrelated'])).toBe(false);
  });

  it('makes a mounted (active) list query refetch, even inside its staleTime', async () => {
    // staleTime mirrors the app's setting: without invalidation the cached copy is
    // served as fresh and the table shows old data until a hard refresh.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    let server = [row('a', 'open')];
    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.requests,
      queryFn: async () => {
        fetches += 1;
        return server;
      },
    });
    const unsubscribe = observer.subscribe(() => {});

    await client.getQueryCache().find({ queryKey: queryKeys.requests })?.fetch(); // settle first load
    const before = fetches;

    // Control: a second mount inside staleTime does NOT refetch.
    await client.refetchQueries({ queryKey: queryKeys.requests, stale: true });
    expect(fetches).toBe(before);

    // The status changes server-side; the write handler invalidates.
    server = [row('a', 'resolved')];
    await invalidateRequestData(client);

    expect(fetches).toBe(before + 1);
    expect(observer.getCurrentResult().data?.[0].status).toBe('resolved');
    unsubscribe();
  });
});

describe('withStatus (optimistic update)', () => {
  it('changes only the targeted row', () => {
    const list = [row('a', 'open'), row('b', 'open')];
    expect(withStatus(list, 'b', 'resolved')?.map((r) => r.status)).toEqual(['open', 'resolved']);
  });

  it('does not mutate the cached array or its rows (TanStack Query relies on immutability)', () => {
    const list = [row('a', 'open')];
    const next = withStatus(list, 'a', 'resolved');
    expect(next).not.toBe(list);
    expect(list[0].status).toBe('open');
  });

  it('is a no-op for an unknown id or an empty cache', () => {
    const list = [row('a', 'open')];
    expect(withStatus(list, 'zzz', 'resolved')).toEqual(list);
    expect(withStatus(undefined, 'a', 'resolved')).toBeUndefined();
  });
});
