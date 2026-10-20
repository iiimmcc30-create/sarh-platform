'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { getApiErrorMessage } from '@/services/api.client';
import {
  fetchAdminReview,
  fetchAdminReviews,
  hideAdminReview,
} from '@/services/admin.service';

type Person = {
  id: string;
  username?: string;
  arabicName?: string;
  displayName?: string;
};

type ReportRow = {
  id: string;
  ticketNumber?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string;
  purchased: boolean;
  recommend: boolean;
  hiddenAt: string | null;
  hiddenReason?: string | null;
  createdAt: string;
  reviewer: Person;
  target: Person;
  reportCount: number;
  reports?: ReportRow[];
};

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'visible', label: 'ظاهرة' },
  { value: 'hidden', label: 'مخفية' },
  { value: 'reported', label: 'عليها بلاغ' },
] as const;

function personName(person?: Person | null) {
  if (!person) return '—';
  return person.arabicName || person.displayName || person.username || person.id;
}

export default function ReviewsPage() {
  const [items, setItems] = useState<ReviewRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof FILTERS)[number]['value']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<ReviewRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [hideOpen, setHideOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reportId, setReportId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminReviews({ page, search, status });
      setItems((data.items ?? []) as unknown as ReviewRow[]);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر تحميل التقييمات'));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReview = async (row: ReviewRow) => {
    setActive(row);
    setReports(row.reports ?? []);
    setReportId(row.reports?.[0]?.id ?? '');
    try {
      const detail = await fetchAdminReview(row.id);
      const nextReports = (detail.reports ?? []) as ReportRow[];
      setReports(nextReports);
      setReportId((current) => current || nextReports[0]?.id || '');
      setActive({ ...(detail.review as unknown as ReviewRow), reports: nextReports });
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر تحميل البلاغات'));
    }
  };

  const hide = async () => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      await hideAdminReview(active.id, { reason: reason.trim(), reportId });
      setHideOpen(false);
      setActive(null);
      setReason('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر إخفاء التقييم'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="التقييمات"
        description="إخفاء فقط عبر بلاغ. لا يمكن تعديل التعليق أو حذف التقييم."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="بحث بالتعليق أو الاسم"
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as (typeof FILTERS)[number]['value']);
            setPage(1);
          }}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => void load()}>
          تحديث
        </Button>
      </div>
      {error ? <p className="mb-4 text-rose-400">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              {['المُقيَّم', 'المُقيِّم', 'النجوم', 'التوصية', 'التعليق', 'البلاغات', 'الحالة', ''].map((label) => (
                <th key={label} className="px-4 py-3 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  جارٍ التحميل…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  لا توجد تقييمات
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3">{personName(row.target)}</td>
                  <td className="px-4 py-3">{personName(row.reviewer)}</td>
                  <td className="px-4 py-3">{row.rating}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.recommend ? 'success' : 'danger'}>
                      {row.recommend ? 'ينصح' : 'لا ينصح'}
                    </Badge>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3">{row.comment || '—'}</td>
                  <td className="px-4 py-3">{row.reportCount ?? row.reports?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.hiddenAt ? 'warning' : 'success'}>
                      {row.hiddenAt ? 'مخفي' : 'ظاهر'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => void openReview(row)}>
                      عرض
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
          السابق
        </Button>
        <span className="text-sm text-slate-400">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => setPage((n) => n + 1)}
        >
          التالي
        </Button>
      </div>

      <Modal
        open={!!active && !hideOpen}
        onClose={() => setActive(null)}
        title="تفاصيل التقييم"
        description="الإخفاء يتم من بلاغ قائم فقط"
        size="lg"
      >
        {active ? (
          <div className="space-y-4 p-5 text-sm text-slate-200">
            <p>
              <span className="text-slate-400">على: </span>
              {personName(active.target)}
            </p>
            <p>
              <span className="text-slate-400">من: </span>
              {personName(active.reviewer)}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-900 p-3">{active.comment || 'بدون تعليق'}</p>
            {active.hiddenReason ? (
              <p className="text-amber-300">سبب الإخفاء: {active.hiddenReason}</p>
            ) : null}
            <div>
              <p className="mb-2 font-medium">البلاغات</p>
              {reports.length === 0 ? (
                <p className="text-slate-500">لا توجد بلاغات على هذا التقييم</p>
              ) : (
                <ul className="space-y-2">
                  {reports.map((report) => (
                    <li key={report.id} className="rounded-xl border border-slate-800 px-3 py-2">
                      <span className="text-emerald-300">{report.ticketNumber}</span>
                      <span className="mx-2 text-slate-500">{report.status}</span>
                      <span>{report.subject}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!active.hiddenAt ? (
              <Button
                variant="danger"
                disabled={reports.length === 0}
                onClick={() => setHideOpen(true)}
              >
                إخفاء التقييم
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={hideOpen}
        onClose={() => setHideOpen(false)}
        title="إخفاء التقييم"
        description="يُسجَّل السبب في سجل التدقيق. التعليق يبقى كما هو ولا يُحذف."
        size="md"
      >
        <div className="space-y-3 p-5">
          <label className="block text-sm text-slate-300">
            البلاغ
            <select
              value={reportId}
              onChange={(event) => setReportId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            >
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.ticketNumber} — {report.subject}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            السبب
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              placeholder="سبب الإخفاء"
            />
          </label>
          <Button
            variant="danger"
            disabled={busy || reason.trim().length < 4 || !reportId}
            onClick={() => void hide()}
          >
            تأكيد الإخفاء
          </Button>
        </div>
      </Modal>
    </div>
  );
}
