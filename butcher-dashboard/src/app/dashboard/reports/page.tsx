'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatCard } from '@/components/ui/StatCard';
import { fetchButcherReports, type ReportsPayload, type ReportsPeriod } from '@/services/reports.service';
import { getApiErrorMessage } from '@/services/api.client';
import { subscribeLiveRefresh } from '@/lib/live-refresh';

function money(value: number) {
  return `${value.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;
}

const PERIODS: Array<{ id: ReportsPeriod; label: string }> = [
  { id: 'today', label: 'اليوم' },
  { id: '7d', label: 'آخر 7 أيام' },
  { id: '30d', label: 'آخر 30 يوم' },
  { id: 'custom', label: 'فترة مخصصة' },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportsPeriod>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (period === 'custom' && (!from || !to)) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const report = await fetchButcherReports({
        period,
        from: period === 'custom' ? from : undefined,
        to: period === 'custom' ? to : undefined,
      });
      setData(report);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل التقارير'));
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('reports', () => {
      void load();
    });
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">التقارير</h1>
        <p className="mt-1 text-sm text-ink-muted">
          بيانات PostgreSQL الحقيقية لملحمتك فقط. المبيعات هنا ليست «كل الطلبات ما عدا الملغاة».
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPeriod(item.id)}
            className={`rounded-xl px-4 py-2 text-sm ${
              period === item.id ? 'bg-brand text-ink' : 'border border-white/10 text-ink-secondary'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {period === 'custom' ? (
        <div className="flex flex-wrap gap-3">
          <label className="text-sm text-ink-muted">
            من
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-white/10 bg-surface px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            إلى
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-xl border border-white/10 bg-surface px-3 py-2 text-ink"
            />
          </label>
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingState label="جارٍ تحميل التقارير..." />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <EmptyState icon={BarChart3} title="لا توجد بيانات للفترة" />
      ) : (
        <>
          <div className="rounded-2xl border border-brand/30 bg-surface p-4 text-sm text-ink-secondary">
            <p className="font-medium text-ink">تعريف المبيعات المستخدم</p>
            <p className="mt-1">{data.definition.labelAr}</p>
            <p className="mt-2 text-xs text-ink-muted">
              ملخص الرئيسية عبر GET /butchers/dashboard ما زال يحسب غير الملغاة بدون شرط الدفع. هذه الصفحة لا تستخدم ذلك التعريف.
            </p>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="إجمالي المبيعات" value={money(data.salesTotal)} icon={Wallet} />
            <StatCard title="عدد طلبات المبيعات" value={data.salesCount} />
            <StatCard title="متوسط قيمة الطلب" value={money(data.avgOrderValue)} />
            <StatCard title="كل الطلبات في الفترة" value={data.orderCountInPeriod} hint="شامل غير المدفوع والملغى" />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="غير مدفوع" value={data.classification.unpaid} />
            <StatCard title="ملغى" value={data.classification.cancelled} />
            <StatCard title="مدفوع قيد التجهيز" value={data.classification.paidPreparing} />
            <StatCard title="مدفوع مكتمل" value={data.classification.paidDelivered} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ProductTable title="الأكثر مبيعًا" rows={data.topProducts} />
            <ProductTable title="الأقل مبيعًا" rows={data.bottomProducts} />
          </section>

          <Series title="المبيعات اليومية" rows={data.daily.map((row) => ({ label: row.date, total: row.total }))} />
          <Series title="المبيعات الأسبوعية" rows={data.weekly.map((row) => ({ label: row.week, total: row.total }))} />
          <Series title="المبيعات الشهرية" rows={data.monthly.map((row) => ({ label: row.month, total: row.total }))} />
        </>
      )}
    </div>
  );
}

function ProductTable({
  title,
  rows,
}: {
  title: string;
  rows: ReportsPayload['topProducts'];
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-surface p-5">
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">لا توجد مبيعات في هذه الفترة.</p>
      ) : (
        <table className="mt-3 min-w-full text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-2 text-start font-medium">المنتج</th>
              <th className="py-2 text-start font-medium">الكمية</th>
              <th className="py-2 text-start font-medium">الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-t border-white/5">
                <td className="py-2 text-ink">{row.nameAr}</td>
                <td className="py-2 text-ink-secondary">{row.quantity}</td>
                <td className="py-2 text-ink-secondary">{money(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Series({ title, rows }: { title: string; rows: Array<{ label: string; total: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  return (
    <div className="rounded-2xl border border-white/5 bg-surface p-5">
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">لا بيانات.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>{row.label}</span>
                <span>{money(row.total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
