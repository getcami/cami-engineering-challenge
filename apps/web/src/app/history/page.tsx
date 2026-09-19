'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  CLASSIFICATION_CATEGORIES,
  ClassificationCategory,
  classifyMessage,
  fetchHistory,
} from '@/lib/api';
import { dateRangeToInstants } from '@/lib/history-filter';
import { invalidateRequestData, queryKeys } from '@/lib/request-cache';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const CATEGORY_STYLES: Record<ClassificationCategory, string> = {
  billing: 'bg-amber-100 text-amber-800',
  sales: 'bg-emerald-100 text-emerald-800',
  support: 'bg-sky-100 text-sky-800',
  unknown: 'bg-slate-100 text-slate-600',
};

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ClassificationCategory | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState('');

  // Debounce typing so we do not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const range = dateRangeToInstants(fromDay, toDay);
  const filtersActive = Boolean(category || search || fromDay || toDay);

  const filter = {
    category: category || undefined,
    search: search || undefined,
    from: range.from,
    to: range.to,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const historyQuery = useQuery({
    // Nested under the shared ['history'] prefix so invalidateRequestData covers it.
    queryKey: [...queryKeys.history, filter],
    queryFn: () => fetchHistory(filter),
    // Keep the old page on screen while the next filter/page loads (no flicker).
    placeholderData: keepPreviousData,
    // An empty/backwards date range is a user mistake we explain inline, not a request.
    enabled: !range.invalid,
  });

  const classifyMutation = useMutation({
    mutationFn: (message: string) => classifyMessage(message),
    onSuccess: () => setDraft(''),
    onSettled: () => invalidateRequestData(queryClient),
  });

  const data = historyQuery.data;
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Classification history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every classification run is recorded with the provider that produced it. Confidence
          shown is the final value after policy; hover it to see what the provider originally
          returned.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const message = draft.trim();
          if (message) {
            classifyMutation.mutate(message);
          }
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Try the classifier on any text (recorded without a request)…"
        />
        <button
          type="submit"
          disabled={classifyMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {classifyMutation.isPending ? 'Classifying…' : 'Classify'}
        </button>
      </form>
      {classifyMutation.isError && (
        <p className="text-sm text-red-700">{classifyMutation.error.message}</p>
      )}

      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Category</span>
          <select
            className="h-10 rounded border border-slate-300 bg-white px-3"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ClassificationCategory | '');
              setPage(0);
            }}
          >
            <option value="">All categories</option>
            {CLASSIFICATION_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="font-medium text-slate-700">Message contains</span>
          <input
            type="search"
            className="h-10 rounded border border-slate-300 px-3"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="e.g. invoice"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">From</span>
          <input
            type="date"
            className="h-10 rounded border border-slate-300 px-3"
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => {
              setFromDay(e.target.value);
              setPage(0);
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">To</span>
          <input
            type="date"
            className="h-10 rounded border border-slate-300 px-3"
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => {
              setToDay(e.target.value);
              setPage(0);
            }}
          />
        </label>

        <button
          type="button"
          disabled={!filtersActive && !searchInput}
          onClick={() => {
            setCategory('');
            setSearchInput('');
            setSearch('');
            setFromDay('');
            setToDay('');
            setPage(0);
          }}
          className="h-10 rounded border border-slate-300 bg-white px-3 disabled:opacity-40"
        >
          Clear filters
        </button>
      </div>
      {range.invalid && (
        <p className="text-sm text-red-700">The “From” date must be on or before the “To” date.</p>
      )}

      {historyQuery.isError && !data ? (
        <p className="text-red-700">
          Failed to load history. {historyQuery.error.message}
        </p>
      ) : !data ? (
        <p className="text-slate-600">Loading history…</p>
      ) : data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {filtersActive
            ? 'No classifications match these filters.'
            : 'No classifications yet. Classify a request on the Requests page, or try the box above.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Request</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-md px-4 py-3 text-slate-900">{item.message}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[item.category]}`}
                    >
                      {item.category}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 tabular-nums"
                    title={`Provider returned ${item.rawCategory} (${item.rawConfidence.toFixed(2)})`}
                  >
                    {item.confidence.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {item.requestId ? item.requestId.slice(0, 8) : 'ad hoc'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Showing {data.offset + 1}–{Math.min(data.offset + data.items.length, total)} of {total}
            {historyQuery.isFetching ? ' · updating…' : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
