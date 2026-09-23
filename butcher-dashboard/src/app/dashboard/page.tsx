'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, PackageX, Store, Wallet } from 'lucide-react';
import { useButcherSession } from '@/components/layout/ButcherSessionProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fetchDashboardSummary, type DashboardSummary } from '@/services/dashboard.service';
import { getApiErrorMessage } from '@/services/api.client';
import { subscribeLiveRefresh } from '@/lib/live-refresh';

function money(value: number, currency = 'SAR') {
  return `${value.toLocaleString('ar-SA')} ${currency === 'SAR' ? 'ر.س' : currency}`;
}

export default function DashboardHomePage() {
  const { butcher } = useButcherSession();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const summary = await fetchDashboardSummary();
      setData(summary);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل ملخص اللوحة'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('dashboard', () => {
      void load();
    });
  }, [load]);

  if (loading && !data) return <LoadingState label="جارٍ تحميل ملخص الملحمة..." />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) {
    return <EmptyState icon={Store} title="لا توجد بيانات للعرض" />;
  }

  const alerts = [...data.inventory.out, ...data.inventory.low];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">الرئيسية</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {data.butcher.nameAr} — بيانات حقيقية من طلبات ومخزون الملحمة المرتبطة بحسابك.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="طلبات جديدة" value={data.counts.pending} icon={ClipboardList} />
        <StatCard title="قيد التجهيز" value={data.counts.preparing} />
        <StatCard title="جاهزة" value={data.counts.ready} />
        <StatCard title="مكتملة اليوم" value={data.counts.deliveredToday} />
        <StatCard title="ملغاة اليوم" value={data.counts.cancelledToday} />
        <StatCard title="مبيعات اليوم" value={money(data.salesToday, data.currency)} icon={Wallet} />
        <StatCard title="مقبولة" value={data.counts.confirmed} hint="حالة النظام الحالية: confirmed" />
        <StatCard
          title="تنبيهات المخزون"
          value={alerts.length}
          icon={PackageX}
          hint={`عتبة العرض ${data.inventory.thresholdKg} كجم (للعرض فقط)`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">آخر الطلبات</h2>
            <Link href="/dashboard/orders" className="text-sm text-brand hover:text-brand-hover">
              عرض الكل
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <EmptyState title="لا توجد طلبات بعد" description="ستظهر الطلبات هنا عند إنشائها من التطبيق." />
          ) : (
            <ul className="divide-y divide-white/5">
              {data.recentOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/dashboard/orders/${order.id}`} className="text-sm font-medium text-ink hover:text-brand">
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {order.customer?.arabicName || order.customer?.displayName || 'عميل'}
                    </p>
                  </div>
                  <div className="text-end">
                    <StatusBadge status={order.status} />
                    <p className="mt-1 text-xs text-ink-secondary">{money(order.totalPrice, order.currency)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">المخزون الحالي</h2>
          {alerts.length === 0 ? (
            <EmptyState
              title="لا توجد تنبيهات مخزون"
              description="الكميات المعروضة هي availableQuantity − reservedQuantity من النظام الحالي."
            />
          ) : (
            <ul className="space-y-3">
              {alerts.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-surface-raised px-3 py-2">
                  <div>
                    <p className="text-sm text-ink">{item.nameAr}</p>
                    <p className="text-xs text-ink-muted">
                      الإجمالي {item.availableQuantity} كجم · المحجوز {item.reservedQuantity} كجم · المتاح{' '}
                      {item.sellableQuantity} كجم
                    </p>
                  </div>
                  <span className={item.stock === 'out' ? 'text-xs text-rose-300' : 'text-xs text-amber-200'}>
                    {item.stock === 'out' ? 'نفد' : 'منخفض'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {butcher?.isOpen === false ? (
        <p className="text-sm text-ink-muted">الملحمة مغلقة حالياً حسب إعداد الملف.</p>
      ) : null}
    </div>
  );
}
