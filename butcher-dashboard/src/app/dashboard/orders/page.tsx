'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orders';
import { fetchButcherOrders, type ButcherOrder } from '@/services/orders.service';
import { getApiErrorMessage } from '@/services/api.client';
import { subscribeLiveRefresh } from '@/lib/live-refresh';

export default function OrdersPage() {
  const [items, setItems] = useState<ButcherOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchButcherOrders({
        page,
        limit,
        status,
        q: q || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل الطلبات'));
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('orders', () => {
      void load();
    });
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">الطلبات</h1>
        <p className="mt-1 text-sm text-ink-muted">طلبات ملحمتك فقط — الحالة من نظام سرح الحالي دون حالات مخترعة.</p>
      </div>

      <form
        className="flex flex-col gap-3 md:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(searchInput.trim());
        }}
      >
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="بحث برقم الطلب أو اسم العميل"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as OrderStatus | '');
          }}
          className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-ink"
        >
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-ink hover:bg-brand-hover"
        >
          بحث
        </button>
      </form>

      {loading && items.length === 0 ? (
        <LoadingState label="جارٍ تحميل الطلبات..." />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="لا توجد طلبات" description="عند ورود طلبات جديدة ستظهر في هذه القائمة." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {items.map((order) => (
              <Link
                key={order.id}
                href={`/dashboard/orders/${order.id}`}
                className="block rounded-2xl border border-white/5 bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">{order.orderNumber}</p>
                  <StatusBadge status={order.status} deliveryType={order.deliveryType} />
                </div>
                <p className="mt-2 text-sm text-ink-secondary">
                  {order.customer?.arabicName || order.customer?.displayName || '—'}
                </p>
                <p className="mt-1 text-sm text-ink">
                  {order.totalPrice.toLocaleString('ar-SA')} ر.س
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {new Date(order.createdAt).toLocaleString('ar-SA')}
                </p>
              </Link>
            ))}
            <Pagination page={page} total={total} limit={limit} onPage={setPage} noun="طلب" />
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-white/5 bg-surface md:block">
          <table className="min-w-full text-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-start font-medium">الطلب</th>
                <th className="px-4 py-3 text-start font-medium">العميل</th>
                <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
                <th className="px-4 py-3 text-start font-medium">الوقت</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => (
                <tr key={order.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-ink hover:text-brand">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {order.customer?.arabicName || order.customer?.displayName || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {order.totalPrice.toLocaleString('ar-SA')} ر.س
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(order.createdAt).toLocaleString('ar-SA')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} deliveryType={order.deliveryType} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination page={page} total={total} limit={limit} onPage={setPage} noun="طلب" />
          </div>
          </div>
        </>
      )}
    </div>
  );
}
