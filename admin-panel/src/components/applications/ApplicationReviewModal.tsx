'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  approveApplication,
  fetchApplication,
  rejectApplication,
} from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';
import { DaftraIntegrationPanel } from '@/components/butchers/DaftraIntegrationPanel';
import {
  documentFileUrl,
  documentPreviewKind,
} from '@/lib/butcherApplicationDocuments';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'قيد المراجعة',
  APPROVED: 'مقبول',
  REJECTED: 'مرفوض',
  WITHDRAWN: 'ملغي',
};

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'default',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'default',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  commercial_license: 'رخصة تجارية',
  national_id: 'هوية وطنية',
  municipal_permit: 'ترخيص بلدي',
  shop_photo: 'صورة المحل',
  other: 'أخرى',
};

function fmtDate(v: unknown) {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ar-SA');
}

function DocumentCard({ doc }: { doc: Record<string, unknown> }) {
  const fileUrl = documentFileUrl(doc);
  const mimeType = doc.mimeType ? String(doc.mimeType) : '';
  const typeLabel = DOC_TYPE_LABELS[String(doc.type)] ?? String(doc.type);
  const fileName = String(doc.originalFileName ?? doc.fileKey ?? '—');
  const previewKind = documentPreviewKind(mimeType, fileName);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-200">{typeLabel}</p>
          <p className="mt-0.5 text-xs text-slate-500">{fileName}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400">
          {String(doc.status)}
        </span>
      </div>

      {fileUrl ? (
        <div className="space-y-3">
          {previewKind === 'image' ? (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={typeLabel}
                className="max-h-48 w-full rounded-lg border border-slate-800 object-contain bg-slate-900"
              />
            </a>
          ) : previewKind === 'pdf' ? (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900 text-sm text-slate-300">
              ملف PDF
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900 text-sm text-slate-500">
              ملف مرفق
            </div>
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm text-emerald-400 hover:text-emerald-300"
          >
            {previewKind === 'image' ? 'فتح الصورة بالحجم الكامل' : 'فتح / تحميل الملف'}
          </a>
        </div>
      ) : (
        <p className="text-sm text-slate-500">لا يوجد رابط للملف</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const text = value == null || value === '' ? '—' : String(value);
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{text}</dd>
    </div>
  );
}

type Props = {
  applicationId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

export function ApplicationReviewModal({ applicationId, open, onClose, onUpdated }: Props) {
  const [app, setApp] = useState<Record<string, unknown> | null>(null);
  const [comment, setComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!applicationId) return Promise.resolve();
    setFetching(true);
    setError('');
    return fetchApplication(applicationId)
      .then(setApp)
      .catch((e) => {
        setApp(null);
        setError(e instanceof Error ? e.message : 'تعذّر تحميل الطلب');
      })
      .finally(() => setFetching(false));
  }, [applicationId]);

  useEffect(() => {
    if (!open || !applicationId) {
      setApp(null);
      setComment('');
      setRejectionReason('');
      setError('');
      return;
    }
    load();
  }, [open, applicationId, load]);

  const status = String(app?.status ?? '');
  const canReview = status === 'SUBMITTED';
  const user = app?.user as Record<string, unknown> | undefined;
  const documents = (app?.documents as Record<string, unknown>[] | undefined) ?? [];
  const timeline = (app?.timeline as Record<string, unknown>[] | undefined) ?? [];

  const handleApprove = async () => {
    if (!applicationId) return;
    setLoading(true);
    setError('');
    try {
      await approveApplication(applicationId, comment);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(getApiErrorMessage(e, 'تعذّر قبول الطلب'));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!applicationId) return;
    if (rejectionReason.trim().length < 10) {
      setError('سبب الرفض يجب أن يكون 10 أحرف على الأقل');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await rejectApplication(applicationId, rejectionReason, comment);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(getApiErrorMessage(e, 'تعذّر رفض الطلب'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={app ? `طلب ملحمة #${app.applicationNumber ?? '—'}` : 'مراجعة الطلب'}
      description={app ? String(app.nameAr ?? app.nameEn ?? '') : undefined}
    >
      {fetching && !app ? (
        <p className="text-slate-400">جارٍ تحميل الطلب...</p>
      ) : !app ? (
        <p className="text-rose-400">{error || 'تعذّر تحميل الطلب'}</p>
      ) : (
        <div className="space-y-4">
          <Badge tone={STATUS_TONE[status] ?? 'default'}>
            {STATUS_LABELS[status] ?? status}
          </Badge>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-3 font-semibold text-white">بيانات الملحمة</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم (عربي)" value={app.nameAr} />
                <Field label="الاسم (إنجليزي)" value={app.nameEn} />
                <Field label="هاتف المحل" value={app.shopPhone} />
                <Field label="السجل التجاري" value={app.commercialReg} />
                <Field label="الدولة" value={app.country} />
                <Field label="المدينة" value={app.cityAr ?? app.city} />
                <Field label="العنوان" value={app.addressAr ?? app.address} />
                <Field label="ساعات العمل" value={`${app.openTime} – ${app.closeTime}`} />
                <Field label="التخصصات" value={(app.specialties as string[])?.join('، ')} />
                <Field label="تاريخ التقديم" value={fmtDate(app.submittedAt)} />
              </dl>
              {Boolean(app.bioAr || app.bioEn) && (
                <div className="mt-3">
                  <p className="text-xs text-slate-500">نبذة</p>
                  <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">
                    {String(app.bioAr ?? app.bioEn)}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-3 font-semibold text-white">صاحب الطلب</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم المستخدم" value={user?.username} />
                <Field label="الاسم" value={user?.arabicName ?? user?.displayName} />
                <Field label="الهاتف" value={user?.phone} />
                <Field label="البريد" value={user?.email} />
                <Field label="معرّف المستخدم" value={user?.id} />
                <Field label="نوع الحساب" value={user?.role ?? 'USER'} />
              </dl>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
              <h3 className="mb-3 font-semibold text-white">حساب الملحمة</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم المستخدم" value={app.accountUsername} />
                <Field label="البريد" value={app.accountEmail} />
                {status === 'APPROVED' ? (
                  <>
                    <Field label="معرّف الملحمة" value={app.provisionedButcherId} />
                    <Field label="معرّف حساب الملحمة" value={app.provisionedButcherUserId} />
                  </>
                ) : (
                  <Field label="حالة الحساب" value="يُنشأ عند قبول الطلب" />
                )}
              </dl>
              {status === 'APPROVED' && app.provisionedButcherId ? (
                <p className="mt-3 text-sm text-emerald-400">تم إنشاء حساب الملحمة.</p>
              ) : null}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
              <h3 className="mb-3 font-semibold text-white">المستندات ({documents.length})</h3>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد مستندات مرفقة</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {documents.map((doc) => (
                    <DocumentCard key={String(doc.id)} doc={doc} />
                  ))}
                </div>
              )}
            </section>

            {timeline.length > 0 && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
                <h3 className="mb-3 font-semibold text-white">سجل الإجراءات</h3>
                <ul className="space-y-2 text-sm">
                  {timeline.map((ev) => (
                    <li key={String(ev.id)} className="rounded-lg border border-slate-800 px-3 py-2">
                      <span className="font-medium text-emerald-400">{String(ev.action)}</span>
                      <span className="mx-2 text-slate-500">·</span>
                      <span className="text-slate-400">{String(ev.actorUsername)}</span>
                      <span className="mx-2 text-slate-600">—</span>
                      <span className="text-slate-500">{fmtDate(ev.createdAt)}</span>
                      {ev.comment ? (
                        <p className="mt-1 text-slate-300">{String(ev.comment)}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {app.rejectionReason ? (
              <section className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 lg:col-span-2">
                <h3 className="mb-2 font-semibold text-rose-300">سبب الرفض</h3>
                <p className="text-sm text-slate-300">{String(app.rejectionReason)}</p>
              </section>
            ) : null}

            {status === 'APPROVED' && app.provisionedButcherId ? (
              <DaftraIntegrationPanel butcherId={String(app.provisionedButcherId)} />
            ) : null}

            {canReview && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
                <h3 className="mb-3 font-semibold text-white">قرار المراجعة</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-400">ملاحظة (اختياري)</label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">سبب الرفض (مطلوب للرفض)</label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="اكتبي سبب الرفض (10 أحرف على الأقل)"
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
                      rows={3}
                    />
                  </div>
                </div>
                {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button disabled={loading} onClick={handleApprove}>
                    {loading ? 'جارٍ...' : 'قبول الطلب'}
                  </Button>
                  <Button variant="danger" disabled={loading} onClick={handleReject}>
                    رفض الطلب
                  </Button>
                  <Button variant="ghost" disabled={loading} onClick={onClose}>
                    إغلاق
                  </Button>
                </div>
              </section>
            )}

            {!canReview && (
              <div className="flex justify-end lg:col-span-2">
                <Button variant="ghost" onClick={onClose}>
                  إغلاق
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
