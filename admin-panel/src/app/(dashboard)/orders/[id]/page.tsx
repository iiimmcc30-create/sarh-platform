'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fetchOrder } from '@/services/admin.service';
import { useAdminOrderSocket } from '@/hooks/useAdminOrderSocket';
import { formatOrderQuantityLabel } from '@/lib/butcherOrderQuantityDisplay';

const STATUS_AR: Record<string, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>()!;
  const id = params?.id ?? '';
  const router = useRouter();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const data = await fetchOrder(id);
    setOrder(data.order);
  }, [id]);

  useEffect(() => {
    load().catch(() => setOrder(null));
  }, [load]);

  useAdminOrderSocket(() => {
    load().catch(() => undefined);
  });

  if (!order) {
    return <p className="text-slate-400">جارٍ التحميل...</p>;
  }

  const butcher = order.butcher as Record<string, unknown> | undefined;
  const customer = order.customer as Record<string, unknown> | undefined;
  const product = order.product as Record<string, unknown> | undefined;
  const timeline = (order.timeline as Array<Record<string, unknown>>) ?? [];
  const audits = (order.audits as Array<Record<string, unknown>>) ?? [];
  const status = String(order.status ?? '');

  return (
    <div>
      <PageHeader
        title={`طلب ${String(order.orderNumber ?? order.id)}`}
        description="تفاصيل الطلب وسجل الحالة والتدقيق"
        actions={<Button variant="ghost" onClick={() => router.back()}>رجوع</Button>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge
          tone={
            status === 'delivered' ? 'success' : status === 'cancelled' ? 'danger' : 'warning'
          }
        >
          {STATUS_AR[status] ?? status}
        </Badge>
        <span className="text-sm text-slate-400">
          الإجمالي: {String(order.totalPrice)} {String(order.currency || 'SAR')}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">معلومات الطلب</h2>
          <InfoRow label="رقم الطلب" value={String(order.orderNumber ?? '—')} />
          <InfoRow label="العميل" value={String(customer?.arabicName ?? customer?.displayName ?? '—')} />
          <InfoRow label="الملحمة" value={String(butcher?.nameAr ?? '—')} />
          <InfoRow
            label="الوزن"
            value={formatOrderQuantityLabel(order.weightKg as number, product) || '—'}
          />
          <InfoRow
            label="المحجوز"
            value={
              formatOrderQuantityLabel(
                (order.reservedQuantity ?? order.weightKg) as number,
                product,
              ) || '—'
            }
          />
          <InfoRow label="الاستلام" value={order.deliveryType === 'delivery' ? 'توصيل' : 'استلام'} />
          {order.deliveryAddress ? (
            <InfoRow label="العنوان" value={String(order.deliveryAddress)} />
          ) : null}
          {order.notes ? <InfoRow label="ملاحظات" value={String(order.notes)} /> : null}
        </section>

        {order.paymentIntegration || order.payment ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white">تكامل الدفع (Network International)</h2>
            {(() => {
              const integration = order.paymentIntegration as Record<string, unknown> | null;
              const payment = order.payment as Record<string, unknown> | null;
              const status = String(integration?.status ?? payment?.status ?? '—');
              return (
                <>
                  <InfoRow label="الحالة" value={status} />
                  <InfoRow
                    label="رقم الطلب الداخلي"
                    value={String(integration?.merchantOrderReference ?? payment?.merchantOrderReference ?? '—')}
                  />
                  <InfoRow
                    label="NI UUID"
                    value={String(integration?.externalOrderId ?? payment?.niOrderUuid ?? '—')}
                  />
                  <InfoRow label="المحاولات" value={String(integration?.retryCount ?? '0')} />
                  <InfoRow
                    label="آخر محاولة"
                    value={
                      integration?.lastAttemptAt
                        ? new Date(String(integration.lastAttemptAt)).toLocaleString('ar-SA')
                        : '—'
                    }
                  />
                  <InfoRow label="آخر خطأ" value={String(integration?.lastError ?? '—')} />
                </>
              );
            })()}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">المنتج والمخزون</h2>
          <InfoRow label="المنتج" value={String(product?.nameAr ?? '—')} />
          <InfoRow label="المتاح" value={String(product?.availableQuantity ?? '—')} />
          <InfoRow label="المحجوز (منتج)" value={String(product?.reservedQuantity ?? '—')} />
          <InfoRow label="قطع الطلب" value={String(order.cutType ?? '—')} />
        </section>

        {order.cancellationReason ? (
          <section className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-5 space-y-2 lg:col-span-2">
            <h2 className="text-lg font-semibold text-rose-300">تفاصيل الإلغاء</h2>
            <InfoRow label="السبب" value={String(order.cancellationReason)} />
            {order.cancelledAt ? (
              <InfoRow label="تاريخ الإلغاء" value={new Date(String(order.cancelledAt)).toLocaleString('ar-SA')} />
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">الجدول الزمني</h2>
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <p className="text-slate-500">لا توجد أحداث</p>
            ) : (
              timeline.map((event) => (
                <div
                  key={String(event.id)}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">
                      {STATUS_AR[String(event.status)] ?? String(event.status)}
                    </p>
                    {event.note ? (
                      <p className="text-sm text-slate-400">{String(event.note)}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(String(event.createdAt)).toLocaleString('ar-SA')}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">سجل التدقيق</h2>
          <div className="space-y-2">
            {audits.length === 0 ? (
              <p className="text-slate-500">لا يوجد سجل تدقيق</p>
            ) : (
              audits.map((audit) => (
                <div
                  key={String(audit.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm"
                >
                  <span className="text-slate-300">
                    {STATUS_AR[String(audit.previousStatus)] ?? String(audit.previousStatus)}
                    {' → '}
                    {STATUS_AR[String(audit.newStatus)] ?? String(audit.newStatus)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(String(audit.changedAt)).toLocaleString('ar-SA')}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
    </div>
  );
}
