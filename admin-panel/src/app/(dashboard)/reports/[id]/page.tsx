'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fetchReport, updateReport } from '@/services/admin.service';

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState('');

  const load = () => fetchReport(id).then((r) => {
    setTicket(r.ticket);
    setNotes(String(r.ticket.adminNotes ?? ''));
  });

  useEffect(() => {
    load();
  }, [id]);

  if (!ticket) return <p className="text-slate-400">جارٍ التحميل...</p>;

  return (
    <div>
      <PageHeader
        title={`بلاغ #${ticket.ticketNumber}`}
        description={String(ticket.subject)}
        actions={<Button variant="ghost" onClick={() => router.back()}>رجوع</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-2">
          <p><Badge>{String(ticket.category)}</Badge> <Badge tone="warning">{String(ticket.priority)}</Badge></p>
          <p className="text-slate-300 whitespace-pre-wrap">{String(ticket.description)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <label className="text-sm text-slate-400">ملاحظات الإدارة</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={5}
          />
          <div className="mt-3 flex gap-2">
            <Button onClick={async () => { await updateReport(id, { adminNotes: notes, status: 'IN_PROGRESS' }); load(); }}>
              حفظ
            </Button>
            <Button variant="primary" onClick={async () => { await updateReport(id, { status: 'RESOLVED', adminNotes: notes }); load(); }}>
              حل البلاغ
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
