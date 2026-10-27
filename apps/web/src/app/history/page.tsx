'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchHistory } from '@/lib/api';

const CATEGORY_OPTIONS = ['', 'billing', 'sales', 'support', 'unknown'];

const CATEGORY_BADGE: Record<string, string> = {
  billing: 'bg-amber-100 text-amber-800',
  sales: 'bg-blue-100 text-blue-800',
  support: 'bg-emerald-100 text-emerald-800',
  unknown: 'bg-slate-100 text-slate-600',
};

export default function HistoryPage() {
  const [category, setCategory] = useState('');

  const historyQuery = useQuery({
    queryKey: ['history', category],
    queryFn: () => fetchHistory(category || undefined),
  });

  const rows = historyQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Classification history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every classification run is logged here. Filter by category to drill into a segment.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Filter:</span>
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt || 'all'}
            type="button"
            onClick={() => setCategory(opt)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === opt
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {opt || 'All'}
          </button>
        ))}
      </div>

      {historyQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : historyQuery.isError ? (
        <p className="text-sm text-red-700">Failed to load history.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No classification events yet. Use the <strong>Classify</strong> button on a request to create one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Message snapshot</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Classified at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="max-w-sm px-4 py-3">
                    <div className="truncate text-slate-800" title={row.messageSnapshot}>
                      {row.messageSnapshot}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        CATEGORY_BADGE[row.category] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {(row.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {row.requestId ?? <span className="italic">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            Showing {rows.length} event{rows.length !== 1 ? 's' : ''}
            {category ? ` in category "${category}"` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
