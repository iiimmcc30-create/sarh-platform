'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchVerificationRequests } from '@/services/support.service';

type Row = {
  id: string;
  status: string;
  fullName?: string;
  nationalId?: string;
  submittedAt?: string;
  user?: { arabicName?: string; username?: string };
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'لم يُرسل',
  UNDER_REVIEW: 'قيد المراجعة',
  NEEDS_AMENDMENTS: 'يحتاج تعديلات',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
};

const FILTER_STATUSES = ['', 'UNDER_REVIEW', 'NEEDS_AMENDMENTS', 'VERIFIED', 'REJECTED', 'DRAFT'] as const;

export default function VerificationRequestsPage() {
  const [status, setStatus] = useState('UNDER_REVIEW');

  const fetchPage = useCallback(
    ({ page, search }: { page: number; search: string }) =>
      fetchVerificationRequests({
        page,
        search,
        status: status || undefined,
      }),
    [status],
  );

  return (
    <ResourcePage<Row>
      title="طلبات توثيق الحساب"
      description="مراجعة وقبول أو رفض طلبات التوثيق"
      fetchPage={fetchPage}
      status={status || undefined}
      filters={
        <div className="flex flex-wrap gap-2 text-sm">
          {FILTER_STATUSES.map((s) => {
            const active = status === s;
            const label = s ? STATUS_LABEL[s] : 'الكل';
            return (
              <button
                key={s || 'all'}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      }
      columns={[
        {
          key: 'user',
          label: 'المستخدم',
          render: (r) => r.user?.arabicName || r.user?.username || '—',
        },
        { key: 'fullName', label: 'الاسم' },
        { key: 'nationalId', label: 'الهوية' },
        {
          key: 'status',
          label: 'الحالة',
          render: (r) => (
            <Badge tone={r.status === 'VERIFIED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>
              {STATUS_LABEL[r.status] ?? r.status}
            </Badge>
          ),
        },
      ]}
      actions={(row) => (
        <Link href={`/support/verification/${row.id}`}>
          <Button variant="ghost" size="sm">مراجعة</Button>
        </Link>
      )}
    />
  );
}
