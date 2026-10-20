'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, ResourcePage } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  fetchUserReview,
  fetchUserReviews,
  hideUserReview,
} from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';

type Person = {
  id?: string;
  username?: string;
  arabicName?: string;
  displayName?: string;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string;
  purchased: boolean;
  recommend: boolean;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  reviewer: Person;
  target: Person;
  reportCount: number;
};

type ReviewReport = {
  id?: string;
  ticketNumber?: string;
  status?: string;
  subject?: string;
  createdAt?: string;
};

function personName(person?: Person) {
  return person?.arabicName || person?.displayName || person?.username || '—';
}

const selectClass =
  'rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500';

export default function ReviewsAdminPage() {
  const [visibility, setVisibility] = useState('all');
  const [recommend, setRecommend] = useState('all');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{
    review: ReviewRow;
    reports: ReviewReport[];
  } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reloadRef = useRef<() => void>(() => undefined);

  async function openReview(id: string) {
    setOpen(true);
    setError('');
    setReason('');
    setDetail(null);
    try {
      const data = await fetchUserReview(id);
      setDetail({
        review: data.review as ReviewRow,
        reports: (data.reports ?? []) as ReviewReport[],
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر فتح التقييم'));
    }
  }

  async function hide() {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      await hideUserReview(detail.review.id, reason.trim());
      reloadRef.current();
      await openReview(detail.review.id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر إخفاء التقييم'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ResourcePage<ReviewRow>
        key={`${visibility}:${recommend}`}
        title="تقييمات الحسابات"
        description="التعليق ثابت بعد الإرسال. الإخفاء يخرجه من المتوسط والعدادات ولا يحذفه."
        fetchPage={({ page, search }) =>
          fetchUserReviews({
            page,
            search,
            ...(visibility !== 'all' ? { visibility } : {}),
            ...(recommend !== 'all' ? { recommend } : {}),
          })
        }
        filters={
          <>
            <select
              aria-label="الظهور"
              className={selectClass}
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
            >
              <option value="all">الكل</option>
              <option value="visible">ظاهر</option>
              <option value="hidden">مخفي</option>
            </select>
            <select
              aria-label="التوصية"
              className={selectClass}
              value={recommend}
              onChange={(event) => setRecommend(event.target.value)}
            >
              <option value="all">كل التوصيات</option>
              <option value="yes">ينصح</option>
              <option value="no">لا ينصح</option>
            </select>
          </>
        }
        columns={[
          {
            key: 'reviewer',
            label: 'المقيّم',
            render: (row) => personName(row.reviewer),
          },
          {
            key: 'target',
            label: 'الحساب',
            render: (row) => personName(row.target),
          },
          { key: 'rating', label: 'النجوم' },
          {
            key: 'recommend',
            label: 'التوصية',
            render: (row) => (
              <Badge tone={row.recommend ? 'success' : 'danger'}>
                {row.recommend ? 'ينصح' : 'لا ينصح'}
              </Badge>
            ),
          },
          {
            key: 'comment',
            label: 'التعليق',
            render: (row) => (
              <span className="line-clamp-2 max-w-xs">{row.comment || '—'}</span>
            ),
          },
          {
            key: 'reportCount',
            label: 'البلاغات',
            render: (row) => row.reportCount ?? 0,
          },
          {
            key: 'hiddenAt',
            label: 'الحالة',
            render: (row) => (
              <Badge tone={row.hiddenAt ? 'warning' : 'success'}>
                {row.hiddenAt ? 'مخفي' : 'ظاهر'}
              </Badge>
            ),
          },
        ]}
        actions={(row, reload) => {
          reloadRef.current = reload;
          return (
            <Button variant="ghost" size="sm" onClick={() => void openReview(row.id)}>
              عرض
            </Button>
          );
        }}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="التقييم"
        description="الإخفاء نهائي ولا يحذف الصف."
        size="lg"
      >
        {!detail ? (
          <p className="text-slate-400">{error || 'جارٍ التحميل...'}</p>
        ) : (
          <div className="space-y-4 text-sm text-slate-200">
            <p>
              <span className="text-slate-400">من </span>
              {personName(detail.review.reviewer)}
              <span className="text-slate-400"> عن </span>
              {personName(detail.review.target)}
            </p>
            <p>
              {detail.review.rating} نجوم ·{' '}
              {detail.review.purchased ? 'اشترى' : 'لم يشترِ'} ·{' '}
              {detail.review.recommend ? 'ينصح' : 'لا ينصح'}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-900 p-3">
              {detail.review.comment || 'بدون تعليق'}
            </p>
            {detail.review.hiddenAt ? (
              <p className="text-amber-300">
                مخفي: {detail.review.hiddenReason || 'بدون سبب مسجّل'}
              </p>
            ) : null}

            <div>
              <h3 className="mb-2 font-medium">البلاغات</h3>
              {detail.reports.length === 0 ? (
                <p className="text-slate-500">لا توجد بلاغات على هذا التقييم</p>
              ) : (
                <ul className="space-y-2">
                  {detail.reports.map((report) => (
                    <li key={report.id} className="flex items-center justify-between gap-3">
                      <span>
                        {report.ticketNumber} · {report.subject} · {report.status}
                      </span>
                      {report.id ? (
                        <Link href={`/reports/${report.id}`} className="text-emerald-400">
                          فتح البلاغ
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.review.hiddenAt ? null : (
              <div className="space-y-2">
                <label className="block text-slate-400" htmlFor="hide-reason">
                  سبب الإخفاء
                </label>
                <textarea
                  id="hide-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white outline-none focus:border-emerald-500"
                  placeholder="سبب يظهر في سجل التدقيق"
                />
                <Button
                  variant="danger"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => void hide()}
                >
                  إخفاء التقييم
                </Button>
              </div>
            )}
            {error ? <p className="text-rose-400">{error}</p> : null}
          </div>
        )}
      </Modal>
    </>
  );
}
