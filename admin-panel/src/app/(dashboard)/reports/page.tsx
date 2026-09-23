'use client';

import Link from 'next/link';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchReports, updateReport } from '@/services/admin.service';

type ReportRow = {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  createdAt: string;
};

const statusTone = (s: string) => {
  if (s === 'OPEN') return 'danger';
  if (s === 'CLOSED' || s === 'RESOLVED') return 'success';
  return 'warning';
};

export default function ReportsPage() {
  return (
    <ResourcePage<ReportRow>
      title="إدارة البلاغات"
      description="بلاغات المستخدمين من مساعد سرح والتطبيق"
      fetchPage={({ page, search }) => fetchReports({ page, search })}
      columns={[
        { key: 'ticketNumber', label: 'الرقم' },
        { key: 'subject', label: 'الموضوع' },
        { key: 'category', label: 'التصنيف' },
        {
          key: 'priority',
          label: 'الأولوية',
          render: (r) => <Badge tone={r.priority === 'URGENT' ? 'danger' : 'default'}>{r.priority}</Badge>,
        },
        {
          key: 'status',
          label: 'الحالة',
          render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
        },
      ]}
      actions={(row, reload) => (
        <div className="flex gap-2">
          <Link href={`/reports/${row.id}`}>
            <Button variant="ghost" size="sm">
              عرض
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await updateReport(row.id, { status: 'IN_REVIEW' });
              reload();
            }}
          >
            مراجعة
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              await updateReport(row.id, { status: 'CLOSED' });
              reload();
            }}
          >
            إغلاق
          </Button>
        </div>
      )}
    />
  );
}
