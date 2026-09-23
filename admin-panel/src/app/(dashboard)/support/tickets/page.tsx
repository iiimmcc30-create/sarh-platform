'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchSupportTickets, updateSupportTicket } from '@/services/support.service';

type TicketRow = {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  updatedAt?: string;
  assignedTo?: { arabicName?: string; displayName?: string; username?: string } | null;
  reporter?: { arabicName?: string; displayName?: string; username?: string } | null;
  order?: { orderNumber?: string } | null;
};

const statusTone = (s: string) => {
  if (s === 'OPEN' || s === 'WAITING_FOR_SUPPORT' || s === 'AI_ASSISTING') return 'danger';
  if (s === 'AWAITING_USER' || s === 'WAITING_FOR_CUSTOMER') return 'warning';
  if (s === 'CLOSED' || s === 'RESOLVED') return 'success';
  return 'default';
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'مفتوحة',
  IN_REVIEW: 'قيد المراجعة',
  AI_ASSISTING: 'سرحان يساعد',
  WAITING_FOR_CUSTOMER: 'بانتظار العميل',
  WAITING_FOR_SUPPORT: 'بانتظار خدمة العملاء',
  IN_PROGRESS: 'قيد المعالجة',
  AWAITING_USER: 'بانتظار المستخدم',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلقة',
};

const CATEGORY_LABEL: Record<string, string> = {
  ORDER_HELP: 'مشكلة في الطلب',
  OTHER_HELP: 'مساعدة في شيء آخر',
};

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'open', label: 'مفتوحة' },
  { value: 'waiting_support', label: 'بانتظار خدمة العملاء' },
  { value: 'in_progress', label: 'قيد المعالجة' },
  { value: 'resolved', label: 'تم الحل' },
  { value: 'closed', label: 'مغلقة' },
] as const;

function personName(p?: TicketRow['reporter']) {
  if (!p) return '—';
  return p.arabicName || p.displayName || p.username || '—';
}

export default function SupportTicketsPage() {
  const [statusGroup, setStatusGroup] = useState<(typeof FILTERS)[number]['value']>('all');

  const fetchPage = useCallback(
    ({ page, search }: { page: number; search: string }) =>
      fetchSupportTickets({
        page,
        search,
        statusGroup: statusGroup === 'all' ? undefined : statusGroup,
        type: 'SUPPORT',
      }),
    [statusGroup],
  );

  return (
    <ResourcePage<TicketRow>
      title="البلاغات"
      description="بلاغات العملاء عبر سرحان وخدمة العملاء — بدون تواصل مع الملحمة"
      fetchPage={fetchPage}
      filters={
        <div className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((s) => {
            const active = statusGroup === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusGroup(s.value)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      }
      columns={[
        { key: 'ticketNumber', label: 'رقم البلاغ' },
        {
          key: 'reporter',
          label: 'العميل',
          render: (r) => personName(r.reporter),
        },
        {
          key: 'category',
          label: 'نوع المساعدة',
          render: (r) => CATEGORY_LABEL[r.category] ?? r.category,
        },
        {
          key: 'order',
          label: 'الطلب',
          render: (r) => r.order?.orderNumber ?? '—',
        },
        {
          key: 'status',
          label: 'الحالة',
          render: (r) => (
            <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
          ),
        },
        { key: 'priority', label: 'الأولوية' },
        {
          key: 'assignedTo',
          label: 'الموظف المسؤول',
          render: (r) => personName(r.assignedTo),
        },
        {
          key: 'updatedAt',
          label: 'آخر تحديث',
          render: (r) =>
            r.updatedAt ? new Date(r.updatedAt).toLocaleString('ar-SA') : '—',
        },
      ]}
      actions={(row, reload) => (
        <div className="flex gap-2">
          <Link href={`/support/tickets/${row.id}`}>
            <Button variant="ghost" size="sm">عرض</Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await updateSupportTicket(row.id, { status: 'IN_PROGRESS' });
              reload();
            }}
          >
            معالجة
          </Button>
        </div>
      )}
    />
  );
}
