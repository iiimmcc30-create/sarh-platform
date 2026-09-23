'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getApiErrorMessage } from '@/services/api.client';
import { fetchVerificationRequest, updateVerificationRequest } from '@/services/support.service';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'لم يُرسل',
  UNDER_REVIEW: 'قيد المراجعة',
  NEEDS_AMENDMENTS: 'يحتاج تعديلات',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
};

export default function VerificationDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const res = await fetchVerificationRequest(id);
      setRequest(res.request);
      setReviewReason(String(res.request.reviewReason ?? ''));
      setAdminNotes(String(res.request.adminNotes ?? ''));
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'تعذّر تحميل طلب التوثيق'));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (!request && !error) return <p className="text-slate-400">جارٍ التحميل...</p>;
  if (!request) {
    return (
      <div className="space-y-3">
        <p className="text-rose-400">{error}</p>
        <Button variant="ghost" onClick={() => router.back()}>رجوع</Button>
      </div>
    );
  }

  const documents = (request.documents as Record<string, unknown>[] | undefined) ?? [];
  const user = request.user as Record<string, unknown> | undefined;

  const updateStatus = async (status: string) => {
    if ((status === 'REJECTED' || status === 'NEEDS_AMENDMENTS') && !reviewReason.trim()) {
      setError('أدخل سبباً يظهر للمستخدم عند الرفض أو طلب التعديلات');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateVerificationRequest(id, { status, reviewReason, adminNotes });
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'تعذّر تحديث الطلب'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="مراجعة طلب التوثيق"
        description={String(user?.arabicName || user?.username || '')}
        actions={<Button variant="ghost" onClick={() => router.back()}>رجوع</Button>}
      />
      {error ? <p className="mb-4 text-rose-400">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <p>
            <Badge tone={request.status === 'VERIFIED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'warning'}>
              {STATUS_LABEL[String(request.status)] ?? String(request.status)}
            </Badge>
          </p>
          <p className="text-slate-300">الاسم: {String(request.fullName ?? '—')}</p>
          <p className="text-slate-300">الهوية: {String(request.nationalId ?? '—')}</p>
          <p className="text-slate-300">المنشأة: {String(request.businessName ?? '—')}</p>
          <p className="text-slate-300">نوع النشاط: {String(request.businessType ?? '—')}</p>
          <p className="text-slate-400 whitespace-pre-wrap">{String(request.additionalInfo ?? '')}</p>
          <div className="space-y-2 pt-2">
            <p className="text-sm text-slate-400">المستندات</p>
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد مستندات</p>
            ) : (
              documents.map((doc) => (
                <a
                  key={String(doc.id)}
                  href={String(doc.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-emerald-400 text-sm underline"
                >
                  {String(doc.originalFileName || doc.type)}
                </a>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <label className="text-sm text-slate-400">سبب للمستخدم (مطلوب عند الرفض / طلب التعديل)</label>
          <textarea
            value={reviewReason}
            onChange={(e) => setReviewReason(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={4}
          />
          <label className="text-sm text-slate-400">ملاحظات داخلية</label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
            rows={4}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void updateStatus('UNDER_REVIEW')}>بدء المراجعة</Button>
            <Button disabled={saving} variant="secondary" onClick={() => void updateStatus('NEEDS_AMENDMENTS')}>
              طلب تعديلات
            </Button>
            <Button disabled={saving} variant="primary" onClick={() => void updateStatus('VERIFIED')}>قبول</Button>
            <Button disabled={saving} variant="ghost" onClick={() => void updateStatus('REJECTED')}>رفض</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
