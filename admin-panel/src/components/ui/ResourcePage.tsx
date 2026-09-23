'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Paginated } from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

/** Shared list fetch args — support/tickets & verification may pass status/category. */
export type ResourcePageFetchParams = {
  page: number;
  search: string;
  status?: string;
  category?: string;
};

type Props<T extends { id: string }> = {
  title: string;
  description?: string;
  columns: Column<T>[];
  fetchPage: (params: ResourcePageFetchParams) => Promise<Paginated<Record<string, unknown>>>;
  actions?: (row: T, reload: () => void) => React.ReactNode;
  filters?: React.ReactNode;
  /** Optional status filter forwarded into fetchPage (e.g. support tickets). */
  status?: string;
  /** Optional category filter forwarded into fetchPage. */
  category?: string;
  /** Extra controls beside search (for example create actions). */
  toolbar?: React.ReactNode;
};

export function ResourcePage<T extends { id: string }>({
  title,
  description,
  columns,
  fetchPage,
  actions,
  filters,
  toolbar,
  status,
  category,
}: Props<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPage({ page, search, status, category });
      setItems(data.items as T[]);
      setTotalPages(data.totalPages);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'تعذّر تحميل البيانات'));
    } finally {
      setLoading(false);
    }
  }, [fetchPage, page, search, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {toolbar}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="بحث..."
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
        {filters}
        <Button variant="secondary" onClick={load}>
          تحديث
        </Button>
      </div>
      {error && <p className="mb-4 text-rose-400">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 text-right font-medium">
                  {c.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right">إجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">
                  جارٍ التحميل...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">
                  لا توجد بيانات
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-slate-200">
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                  {actions && <td className="px-4 py-3">{actions(row, load)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>
          صفحة {page} من {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Badge };
