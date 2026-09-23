'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getApiErrorMessage } from '@/services/api.client';
import {
  fetchSupportTicket,
  fetchSupportStaff,
  replySupportTicket,
  updateSupportTicket,
} from '@/services/support.service';
import { useAdminSupportTicketSocket } from '@/hooks/useAdminSupportTicketSocket';
import { formatOrderQuantityLabel } from '@/lib/butcherOrderQuantityDisplay';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'جديدة',
  IN_REVIEW: 'قيد المراجعة',
  AI_ASSISTING: 'سرحان يساعد',
  WAITING_FOR_CUSTOMER: 'بانتظار العميل',
  WAITING_FOR_SUPPORT: 'بانتظار خدمة العملاء',
  IN_PROGRESS: 'قيد المعالجة',
  AWAITING_USER: 'بانتظار المستخدم',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلقة',
};

export default function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [staff, setStaff] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [ticketRes, staffRes] = await Promise.all([
        fetchSupportTicket(id),
        fetchSupportStaff(),
      ]);
      setTicket(ticketRes.ticket);
      setStaff(staffRes.staff);
      setNotes(String(ticketRes.ticket.adminNotes ?? ''));
      setAssignedToId(String(ticketRes.ticket.assignedToId ?? ''));
      setStatus(String(ticketRes.ticket.status ?? 'OPEN'));
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'تعذّر تحميل التذكرة'));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useAdminSupportTicketSocket(id, () => {
    void load();
  });

  if (!ticket && !error) return <p className="text-slate-400">جارٍ التحميل...</p>;
  if (!ticket) {
    return (
      <div className="space-y-3">
        <p className="text-rose-400">{error}</p>
        <Button variant="ghost" onClick={() => router.back()}>رجوع</Button>
      </div>
    );
  }

  const messages = (ticket.messages as Record<string, unknown>[] | undefined) ?? [];
  const order = ticket.order as Record<string, unknown> | null | undefined;
  const metadata = (ticket.metadata as Record<string, unknown> | null | undefined) ?? {};
  const reporter = ticket.reporter as Record<string, unknown> | undefined;
  const orderItems = (order?.items as Record<string, unknown>[] | undefined) ?? [];

  const authorLabel = (msg: Record<string, unknown>) => {
    if (msg.authorKind === 'SARHAN') return 'سرحان';
    if (msg.authorKind === 'STAFF' || msg.isStaffReply) return 'خدمة العملاء';
    return 'العميل';
  };

  return (
    <div>
      <PageHeader
        title={`تذكرة #${ticket.ticketNumber}`}
        description={String(ticket.subject)}
        actions={<Button variant="ghost" onClick={() => router.back()}>رجوع</Button>}
      />
      {error ? <p className="mb-4 text-rose-400">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <p><Badge>{String(ticket.category)}</Badge></p>
          <p className="text-sm text-slate-400">
            العميل: {String(reporter?.arabicName || reporter?.displayName || reporter?.username || '—')}
          </p>
          {typeof metadata.issueType === 'string' ? (
            <p className="text-sm text-slate-300">تصنيف سرحان: {String(metadata.issueType)}</p>
          ) : null}
          {typeof metadata.summary === 'string' ? (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">ملخص: {String(metadata.summary)}</p>
          ) : null}
          <p className="text-slate-300 whitespace-pre-wrap">{String(ticket.description)}</p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={String(msg.id)}
                className={`rounded-xl p-3 ${msg.isStaffReply ? 'bg-emerald-950/40 border border-emerald-900/40' : 'bg-slate-950/60'}`}
              >
                <p className="text-xs text-slate-500 mb-1">{authorLabel(msg)}</p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{String(msg.body)}</p>
              </div>
            ))}
          </div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="رد للمستخدم..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={4}
          />
          <Button
            disabled={saving || !reply.trim()}
            onClick={async () => {
              if (!reply.trim()) return;
              setSaving(true);
              setError('');
              try {
                await replySupportTicket(id, { body: reply.trim() });
                setReply('');
                await load();
              } catch (e: unknown) {
                setError(getApiErrorMessage(e, 'تعذّر إرسال الرد'));
              } finally {
                setSaving(false);
              }
            }}
          >
            إرسال رد
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          {order ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-sm text-slate-300">
              <p className="font-semibold text-white">تفاصيل الطلب (للعرض فقط — لا يمكن التعديل من هنا)</p>
              <p>رقم الطلب: {String(order.orderNumber)}</p>
              <p>حالة الطلب: {String(order.status)}</p>
              <p>حالة الدفع: {String(order.paymentStatus)}</p>
              <p>الإجمالي: {String(order.totalPrice)} {String(order.currency ?? 'SAR')}</p>
              <ul className="list-disc pr-5">
                {orderItems.map((item) => {
                  const product = item.product as Record<string, unknown> | undefined;
                  return (
                    <li key={String(item.id)}>
                      {String(product?.nameAr ?? item.cutType)} —{' '}
                      {formatOrderQuantityLabel(item.weightKg as number, product) ||
                        String(item.weightKg)}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <label className="text-sm text-slate-400">الحالة</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <label className="text-sm text-slate-400">تعيين لموظف</label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
          >
            <option value="">—</option>
            {staff.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {String(s.arabicName || s.displayName || s.username)}
              </option>
            ))}
          </select>

          <label className="text-sm text-slate-400">ملاحظات داخلية (تُحفظ مع التذكرة)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={4}
          />
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await updateSupportTicket(id, {
                  status,
                  adminNotes: notes,
                  assignedToId: assignedToId || null,
                });
                await load();
              } catch (e: unknown) {
                setError(getApiErrorMessage(e, 'تعذّر الحفظ'));
              } finally {
                setSaving(false);
              }
            }}
          >
            حفظ
          </Button>

          <label className="text-sm text-slate-400">إضافة ملاحظة داخلية سريعة</label>
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="ملاحظة للفريق فقط..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={3}
          />
          <Button
            variant="secondary"
            disabled={saving || !internalNote.trim()}
            onClick={async () => {
              if (!internalNote.trim()) return;
              setSaving(true);
              setError('');
              try {
                await replySupportTicket(id, { body: internalNote.trim(), isInternal: true });
                setInternalNote('');
                await load();
              } catch (e: unknown) {
                setError(getApiErrorMessage(e, 'تعذّر إضافة الملاحظة'));
              } finally {
                setSaving(false);
              }
            }}
          >
            إضافة ملاحظة داخلية
          </Button>
        </div>
      </div>
    </div>
  );
}
