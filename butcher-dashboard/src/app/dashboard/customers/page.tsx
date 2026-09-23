'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Pagination } from '@/components/ui/Pagination';
import { fetchButcherCustomers, type ButcherCustomer } from '@/services/customers.service';
import { getApiErrorMessage } from '@/services/api.client';
import { subscribeLiveRefresh } from '@/lib/live-refresh';

export default function CustomersPage() {
  const [items, setItems] = useState<ButcherCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchButcherCustomers({
        page,
        limit,
        q: q || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل العملاء'));
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('customers', () => {
      void load();
    });
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">العملاء</h1>
        <p className="mt-1 text-sm text-ink-muted">
          عملاء تعاملوا مع ملحمتك عبر الطلبات فقط. التجميع يتم في الخادم حسب JWT دون جلب كل الطلبات إلى المتصفح.
        </p>
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
          placeholder="بحث بالاسم أو رقم الجوال"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-ink hover:bg-brand-hover">
          بحث
        </button>
      </form>

      {loading && items.length === 0 ? (
        <LoadingState label="جارٍ تحميل العملاء..." />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد عملاء بعد"
          description="سيظهر هنا من طلب من ملحمتك فقط. لن ترى عملاء ملاحم أخرى."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-surface">
          <table className="min-w-full text-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-start font-medium">العميل</th>
                <th className="px-4 py-3 text-start font-medium">التواصل</th>
                <th className="px-4 py-3 text-start font-medium">عدد الطلبات</th>
                <th className="px-4 py-3 text-start font-medium">إجمالي المشتريات المدفوعة</th>
                <th className="px-4 py-3 text-start font-medium">آخر طلب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((customer) => (
                <tr key={customer.customerId} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{customer.name}</td>
                  <td className="px-4 py-3 text-ink-secondary" dir="ltr">
                    {customer.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{customer.orderCount}</td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {customer.paidTotal.toLocaleString('ar-SA')} ر.س
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    <div>{customer.lastOrderNumber || '—'}</div>
                    <div>{new Date(customer.lastOrderAt).toLocaleString('ar-SA')}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination page={page} total={total} limit={limit} onPage={setPage} noun="عميل" />
          </div>
        </div>
      )}
    </div>
  );
}
