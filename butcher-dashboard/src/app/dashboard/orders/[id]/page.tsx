'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/constants/orders';
import {
  fetchButcherOrder,
  updateButcherOrderStatus,
  type ButcherOrder,
} from '@/services/orders.service';
import { getApiErrorMessage } from '@/services/api.client';
import { notifyAllLiveRefresh, subscribeLiveRefresh } from '@/lib/live-refresh';
import { isBrowserOnline } from '@/lib/pwa';
import { formatOrderQuantityLabel } from '@/lib/butcherOrderQuantityDisplay';

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const [order, setOrder] = useState<ButcherOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(isBrowserOnline());
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      setOrder(await fetchButcherOrder(id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل الطلب'));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('orders', () => {
      void load();
    });
  }, [load]);

  const confirmChange = async () => {
    if (!pendingStatus || !id) return;
    if (!isBrowserOnline()) {
      toast.show('لا يمكن تغيير حالة الطلب بدون اتصال');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateButcherOrderStatus(id, pendingStatus);
      setOrder(updated);
      notifyAllLiveRefresh();
      toast.show('تم تحديث حالة الطلب');
      setPendingStatus(null);
    } catch (err) {
      toast.show(getApiErrorMessage(err, 'تعذر تحديث الحالة'));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !order) return <LoadingState label="جارٍ تحميل الطلب..." />;
  if (error && !order) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!order) return <EmptyState title="الطلب غير موجود" />;

  const next = order.allowedNextStatuses ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/orders" className="text-sm text-ink-muted hover:text-ink">
            ← الطلبات
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{order.orderNumber}</h1>
        </div>
        <StatusBadge status={order.status} deliveryType={order.deliveryType} />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <h2 className="text-sm font-medium text-ink-muted">العميل</h2>
          <p className="mt-2 text-ink">{order.customer?.arabicName || order.customer?.displayName || '—'}</p>
          {order.customer?.phone ? <p className="mt-1 text-sm text-ink-secondary">{order.customer.phone}</p> : null}
        </div>
        <div className="rounded-2xl border border-white/5 bg-surface p-5">
          <h2 className="text-sm font-medium text-ink-muted">الدفع والتوصيل</h2>
          <p className="mt-2 text-ink">الدفع: {order.paymentStatus}</p>
          <p className="mt-1 text-sm text-ink-secondary">
            {order.deliveryType === 'delivery' ? 'توصيل' : 'استلام'}
            {order.deliveryAddress ? ` — ${order.deliveryAddress}` : ''}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{new Date(order.createdAt).toLocaleString('ar-SA')}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">المنتجات</h2>
        <ul className="space-y-3">
          {(order.items && order.items.length > 0
            ? order.items
            : [
                {
                  id: order.productId,
                  productId: order.productId,
                  cutType: order.cutType,
                  weightKg: order.weightKg,
                  linePrice: order.totalPrice,
                  product: order.product,
                },
              ]
          ).map((line) => (
            <li key={line.id} className="flex justify-between gap-3 rounded-xl bg-surface-raised px-3 py-2">
              <div>
                <p className="text-sm text-ink">{line.product?.nameAr ?? 'منتج'}</p>
                <p className="text-xs text-ink-muted">
                  {line.cutType} · {formatOrderQuantityLabel(line.weightKg, line.product)}
                </p>
              </div>
              <p className="text-sm text-ink-secondary">{line.linePrice.toLocaleString('ar-SA')} ر.س</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-end text-sm font-medium text-ink">
          الإجمالي: {order.totalPrice.toLocaleString('ar-SA')} ر.س
        </p>
        {order.notes ? <p className="mt-3 text-sm text-ink-muted">ملاحظات: {order.notes}</p> : null}
      </section>

      <section className="rounded-2xl border border-white/5 bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">تغيير الحالة</h2>
        {next.length === 0 ? (
          <p className="text-sm text-ink-muted">لا توجد انتقالات متاحة لهذه الحالة.</p>
        ) : !online ? (
          <p className="text-sm text-amber-200">لا يمكن تغيير حالة الطلب بدون اتصال.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next.map((status) => (
              <button
                key={status}
                type="button"
                className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm text-ink hover:bg-brand-hover"
                onClick={() => setPendingStatus(status)}
              >
                {ORDER_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        )}
      </section>

      {order.timeline && order.timeline.length > 0 ? (
        <section className="rounded-2xl border border-white/5 bg-surface p-5">
          <h2 className="mb-3 text-base font-semibold text-ink">الجدول الزمني</h2>
          <ol className="space-y-2">
            {order.timeline.map((entry) => (
              <li key={entry.id} className="text-sm text-ink-secondary">
                {ORDER_STATUS_LABELS[entry.status]} — {new Date(entry.createdAt).toLocaleString('ar-SA')}
                {entry.note ? ` · ${entry.note}` : ''}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {order.audits && order.audits.length > 0 ? (
        <section className="rounded-2xl border border-white/5 bg-surface p-5">
          <h2 className="mb-3 text-base font-semibold text-ink">سجل تغيير الحالة</h2>
          <ol className="space-y-2">
            {order.audits.map((entry) => (
              <li key={entry.id} className="text-sm text-ink-secondary">
                {ORDER_STATUS_LABELS[entry.previousStatus]} → {ORDER_STATUS_LABELS[entry.newStatus]} —{' '}
                {new Date(entry.changedAt).toLocaleString('ar-SA')}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingStatus != null}
        title="تأكيد تغيير الحالة"
        description={
          pendingStatus
            ? `سيتم تغيير الطلب إلى «${ORDER_STATUS_LABELS[pendingStatus]}» وفق منطق النظام الحالي.`
            : undefined
        }
        confirmLabel="تأكيد"
        danger={pendingStatus === 'cancelled'}
        busy={busy}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void confirmChange()}
      />
    </div>
  );
}
