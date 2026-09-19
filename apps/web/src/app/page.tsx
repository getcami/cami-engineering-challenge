'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  classifyMessage,
  createRequest,
  fetchRequests,
  RequestListItem,
  RequestStatus,
  updateRequestStatus,
} from '@/lib/api';
import { invalidateRequestData, queryKeys, withStatus } from '@/lib/request-cache';

const STATUSES: RequestStatus[] = ['open', 'in_progress', 'resolved'];

export default function HomePage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const requestsQuery = useQuery({
    queryKey: queryKeys.requests,
    queryFn: fetchRequests,
  });

  const createMutation = useMutation({
    mutationFn: (message: string) => createRequest(message),
    onSuccess: () => {
      invalidateRequestData(queryClient);
      setDraft('');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequestStatus }) =>
      updateRequestStatus(id, status),
    // Optimistic: the <select> is controlled by cached data, so without this it
    // snaps back to the old value until the refetch lands.
    onMutate: async ({ id, status }) => {
      // Stop an in-flight refetch from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: queryKeys.requests });
      const previous = queryClient.getQueryData<RequestListItem[]>(queryKeys.requests);
      queryClient.setQueryData<RequestListItem[]>(queryKeys.requests, (old) =>
        withStatus(old, id, status),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      // Roll back to what the server last told us.
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.requests, context.previous);
      }
    },
    // Success or failure, the server's copy wins.
    onSettled: () => invalidateRequestData(queryClient),
  });

  const classifyMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      classifyMessage(message, id),
    // Classifying changes the row (category, confidence, and open -> in_progress)
    // and adds a history entry, so both cached views are stale afterwards.
    onSettled: () => invalidateRequestData(queryClient),
  });

  if (requestsQuery.isLoading) {
    return <p className="text-slate-600">Loading requests…</p>;
  }

  if (requestsQuery.isError) {
    return (
      <p className="text-red-700">
        Could not load requests. Is the API running at{' '}
        {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}?
      </p>
    );
  }

  const requests = requestsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Open requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          Update status or run classification. Seeded volume is intentional — watch API
          behaviour under load.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const message = draft.trim();
          if (message) {
            createMutation.mutate(message);
          }
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Log a new customer request…"
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Adding…' : 'Add request'}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.slice(0, 25).map((row) => (
              <tr key={row.id}>
                <td className="max-w-md px-4 py-3">
                  <div className="font-medium text-slate-900">{row.message}</div>
                  {row.latestNotePreview ? (
                    <div className="mt-1 text-xs text-slate-500">
                      Latest note: {row.latestNotePreview}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded border border-slate-300 bg-white px-2 py-1"
                    value={row.status}
                    onChange={(e) =>
                      statusMutation.mutate({
                        id: row.id,
                        status: e.target.value as RequestStatus,
                      })
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 tabular-nums">{row.noteCount}</td>
                <td className="px-4 py-3">
                  {row.category ?? '—'}
                  {row.confidence != null ? (
                    <span className="ml-1 text-xs text-slate-500">
                      ({row.confidence.toFixed(2)})
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={classifyMutation.isPending && classifyMutation.variables?.id === row.id}
                    className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    onClick={() =>
                      classifyMutation.mutate({ id: row.id, message: row.message })
                    }
                  >
                    {classifyMutation.isPending && classifyMutation.variables?.id === row.id
                      ? 'Classifying…'
                      : 'Classify'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createMutation.isError && (
        <p className="text-sm text-red-700">{createMutation.error.message}</p>
      )}
      {statusMutation.isError && (
        <p className="text-sm text-red-700">{statusMutation.error.message}</p>
      )}
      {classifyMutation.isError && (
        <p className="text-sm text-red-700">{classifyMutation.error.message}</p>
      )}
      {classifyMutation.isSuccess && (
        <p className="text-sm text-slate-600">
          Classified as <span className="font-medium">{classifyMutation.data.category}</span>{' '}
          ({classifyMutation.data.confidence.toFixed(2)}) via {classifyMutation.data.provider}.
        </p>
      )}
    </div>
  );
}
