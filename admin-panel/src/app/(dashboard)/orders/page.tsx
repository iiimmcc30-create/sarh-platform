'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, ResourcePage } from '@/components/ui/ResourcePage';
import { fetchButchers, fetchOrders, fetchUsers } from '@/services/admin.service';
import { useAdminOrderSocket } from '@/hooks/useAdminOrderSocket';

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: number;
  currency: string;
  butcher?: { id?: string; nameAr?: string };
  customer?: { id?: string; arabicName?: string; displayName?: string };
  timeline?: Array<{ id: string }>;
};

const STATUS_AR: Record<string, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

const STATUS_OPTIONS = Object.entries(STATUS_AR);

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [butcherId, setButcherId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [butchers, setButchers] = useState<Array<{ id: string; nameAr?: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; arabicName?: string; displayName?: string }>>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetchButchers({ page: 1, pageSize: 200 })
      .then((data) => setButchers(data.items as Array<{ id: string; nameAr?: string }>))
      .catch(() => undefined);
    fetchUsers({ page: 1, pageSize: 200 })
      .then((data) => setCustomers(data.items as Array<{ id: string; arabicName?: string; displayName?: string }>))
      .catch(() => undefined);
  }, []);

  useAdminOrderSocket(() => setReloadKey((k) => k + 1));

  const fetchPage = useCallback(
    async ({ page, search }: { page: number; search: string }) => {
      void reloadKey;
      return fetchOrders({
        page,
        search,
        status: status || undefined,
        butcherId: butcherId || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        orderNumber: orderNumber || undefined,
      });
    },
    [status, butcherId, customerId, dateFrom, dateTo, orderNumber, reloadKey],
  );

  return (
    <ResourcePage<OrderRow>
      title="إدارة الطلبات"
      description="متابعة حالة الطلبات والمخزون المحجوز — تحديث تلقائي"
      fetchPage={fetchPage}
      filters={
        <>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">كل الحالات</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={butcherId}
            onChange={(e) => setButcherId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">كل الملاحم</option>
            {butchers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr ?? b.id}
              </option>
            ))}
          </select>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">كل العملاء</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.arabicName ?? c.displayName ?? c.id}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="رقم الطلب"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </>
      }
      columns={[
        { key: 'orderNumber', label: 'رقم الطلب' },
        {
          key: 'status',
          label: 'الحالة',
          render: (r) => (
            <Badge
              tone={
                r.status === 'delivered'
                  ? 'success'
                  : r.status === 'cancelled'
                    ? 'danger'
                    : 'warning'
              }
            >
              {STATUS_AR[r.status] ?? r.status}
            </Badge>
          ),
        },
        {
          key: 'butcher',
          label: 'الملحمة',
          render: (r) => r.butcher?.nameAr ?? '—',
        },
        {
          key: 'customer',
          label: 'العميل',
          render: (r) => r.customer?.arabicName ?? r.customer?.displayName ?? '—',
        },
        {
          key: 'totalPrice',
          label: 'الإجمالي',
          render: (r) => `${r.totalPrice} ${r.currency || 'SAR'}`,
        },
        {
          key: 'timeline',
          label: 'أحداث الطلب',
          render: (r) => `${r.timeline?.length ?? 0} حدث`,
        },
      ]}
      actions={(row) => (
        <Link href={`/orders/${row.id}`} className="text-emerald-400 hover:underline">
          التفاصيل
        </Link>
      )}
    />
  );
}
