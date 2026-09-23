'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApplicationReviewModal } from '@/components/applications/ApplicationReviewModal';
import { fetchApplications } from '@/services/admin.service';

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

function fmtDate(v: unknown) {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('ar-SA');
}

export default function ApplicationsPage() {
  const [data, setData] = useState<{ applications?: Record<string, unknown>[] } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const loadList = useCallback(() => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (search.trim().length >= 2) params.search = search.trim();
    fetchApplications(params)
      .then((res) => setData(res as { applications?: Record<string, unknown>[] }))
      .catch(console.error);
  }, [status, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const apps = data?.applications ?? [];

  return (
    <div>
      <PageHeader title="طلبات الملاحم" description="مراجعة وموافقة طلبات التسجيل" />
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الرقم أو الجوال"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 text-right">#</th>
              <th className="px-4 py-3 text-right">الاسم</th>
              <th className="px-4 py-3 text-right">المستخدم</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">التاريخ</th>
              <th className="px-4 py-3 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  لا توجد طلبات
                </td>
              </tr>
            ) : (
              apps.map((a) => {
                const user = a.user as Record<string, unknown> | undefined;
                const rowStatus = String(a.status);
                return (
                  <tr key={String(a.id)} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-400">{String(a.applicationNumber ?? '—')}</td>
                    <td className="px-4 py-3">{String(a.nameAr ?? a.nameEn ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {String(user?.username ?? user?.arabicName ?? '—')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[rowStatus] ?? 'default'}>
                        {STATUS_LABELS[rowStatus] ?? rowStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{fmtDate(a.submittedAt ?? a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="secondary" onClick={() => setReviewId(String(a.id))}>
                        مراجعة
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ApplicationReviewModal
        applicationId={reviewId}
        open={reviewId !== null}
        onClose={() => setReviewId(null)}
        onUpdated={loadList}
      />
    </div>
  );
}
