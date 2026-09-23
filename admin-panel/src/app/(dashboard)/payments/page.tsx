'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumbs, PageState } from '@/components/ui/AdminChrome';
import {
  fetchPaymentIntegrations,
  type IntegrationPaymentRow,
} from '@/services/payments.service';
import { getApiErrorMessage } from '@/services/api.client';

const STATUS_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'pending', label: 'معلق' },
  { value: 'processing', label: 'قيد المعالجة' },
  { value: 'synced', label: 'متزامن' },
  { value: 'failed', label: 'فشل' },
  { value: 'retrying', label: 'إعادة محاولة' },
];

export default function PaymentsPage() {
  const [items, setItems] = useState<IntegrationPaymentRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPaymentIntegrations({
        page,
        pageSize: 20,
        status: status || undefined,
      });
      setItems(data.items);
      setTotalPages(data.totalPages);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'تعذّر تحميل المدفوعات'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'لوحة التحكم', href: '/' },
          { label: 'المدفوعات' },
        ]}
      />
      <PageHeader
        title="مركز المدفوعات"
        description="عرض فقط عبر /admin/integrations — بدون استرداد أو تعديل"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(f.value);
            }}
            className={
              status === f.value
                ? 'rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-300'
                : 'rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-400'
            }
          >
            {f.label}
          </button>
        ))}
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          تحديث
        </Button>
      </div>

      {error ? <PageState kind="error" message={error} /> : null}
      {loading ? <PageState kind="loading" message="جارٍ التحميل..." /> : null}
      {!loading && !error && items.length === 0 ? (
        <PageState kind="empty" message="لا سجلات مدفوعات" />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                {[
                  'مرجع التاجر',
                  'المبلغ',
                  'حالة الدفع',
                  'مطابقة',
                  'التكامل',
                  'المزود',
                  'المستخدم',
                  'التاريخ',
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.merchantOrderReference ?? row.payment?.orderId ?? row.id}
                  </td>
                  <td className="px-4 py-3">
                    {row.payment
                      ? `${row.payment.amount} ${row.payment.currency ?? 'SAR'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{row.payment?.status ?? '—'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {row.payment?.metadata?.needsReconciliation ? (
                      <Badge>يحتاج مطابقة</Badge>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3 uppercase">{row.provider}</td>
                  <td className="px-4 py-3">
                    {row.payment?.user?.arabicName ||
                      row.payment?.user?.displayName ||
                      '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(
                      row.payment?.createdAt ?? row.createdAt,
                    ).toLocaleString('ar-SA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </Button>
          <span className="text-xs text-slate-400">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      ) : null}
    </div>
  );
}
