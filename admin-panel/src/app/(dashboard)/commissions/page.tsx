'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Breadcrumbs, PageState } from '@/components/ui/AdminChrome';
import { fetchDashboardStats, type DashboardStats } from '@/services/dashboard.service';
import { getStoredUser } from '@/services/auth.service';
import { Percent, Wallet } from 'lucide-react';

export default function CommissionsPage() {
  const user = getStoredUser();
  const isAdmin = user?.role === 'ADMIN';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    fetchDashboardStats()
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <PageState
        kind="error"
        message="مركز العمولات متاح لمسؤول النظام (ADMIN) فقط"
      />
    );
  }

  if (error) return <PageState kind="error" message={error} />;
  if (!stats?.commission) {
    return <PageState kind="loading" message="جارٍ تحميل ملخص العمولات..." />;
  }

  const c = stats.commission;
  const listingRate = c.listingCommissionRatePercent ?? c.butcherStoreRatePercent;
  const orderRate = c.orderCommissionRatePercent ?? 10;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'لوحة التحكم', href: '/' },
          { label: 'العمولات' },
        ]}
      />
      <PageHeader
        title="مركز العمولات"
        description="عرض فقط — لا تعديل للنسب من هذه الشاشة"
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Listing Commission"
          value={`${listingRate}%`}
          subtitle="عمولة إعلان الملحمة — ListingFee"
          icon={Percent}
          accent="violet"
        />
        <StatCard
          title="Order Commission"
          value={`${orderRate}%`}
          subtitle="عمولة الطلب المكتمل — delivered"
          icon={Percent}
          accent="blue"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Listing Fees"
          value={`${c.listingFeesPaidTotal.toLocaleString('ar-SA')} ر.س`}
          subtitle={`${c.listingFeesPaidCount} رسوم إعلان متجر مدفوعة`}
          icon={Wallet}
        />
        <StatCard
          title="Order Commissions"
          value={`${(c.orderCommissionsTotal ?? 0).toLocaleString('ar-SA')} ر.س`}
          subtitle={`${c.orderCommissionsCount ?? 0} طلب مكتمل`}
          icon={Wallet}
          accent="blue"
        />
        <StatCard
          title="Total Commission"
          value={`${(c.totalCommission ?? c.listingFeesPaidTotal).toLocaleString('ar-SA')} ر.س`}
          subtitle={`مستحق إعلانات: ${c.listingFeesOutstandingTotal.toLocaleString('ar-SA')} ر.س`}
          icon={Wallet}
          accent="amber"
        />
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">
        <h2 className="font-semibold text-white">مصدر الحقيقة</h2>
        <p>{c.noteAr}</p>
        <ul className="list-disc space-y-1 pr-5 text-slate-400">
          <li>
            الحساب في <code className="text-emerald-300">backend-nest/src/lib/commissions.ts</code>
          </li>
          <li>
            اكتمال الطلب = حالة <code>delivered</code> في OrderLifecycleService
          </li>
          <li>
            الإعفاء عندما تكون صلاحية الباقة <code>storeCommission &lt;= 0</code> (إعلان + طلب)
          </li>
          <li>عمولة الإعلان 1% منفصلة عن عمولة الطلب 10%</li>
          <li>النسبة الرقمية للطلب لا تُعرض في لوحة الملحمة أو تطبيق الموبايل</li>
        </ul>
      </div>

      <ListingFeeCompliancePanel />
    </div>
  );
}

function ListingFeeCompliancePanel() {
  const [rows, setRows] = useState<
    Array<{
      user: { id: string; username: string; arabicName: string; isActive: boolean };
      deletedUnpaidCount: number;
      outstandingTotal: number;
      previousActions: Array<{ id: string; action: string; reason: string; createdAt: string }>;
    }>
  >([]);
  const [error, setError] = useState('');

  useEffect(() => {
    import('@/services/admin.service')
      .then((admin) => admin.fetchListingFeeCompliance())
      .then((data) => setRows(data.users ?? []))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mt-8 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="font-semibold text-white">التزام رسوم الإعلانات المحذوفة</h2>
      <p className="text-sm text-slate-400">
        عرض فقط لنمط الحذف مع رسوم مستحقة. لا يُغلق الحساب تلقائياً — الإغلاق يدوي بسبب موثّق.
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">لا توجد حالات حالية.</p>
      ) : (
        <ul className="space-y-3 text-sm text-slate-300">
          {rows.map((row) => (
            <li key={row.user.id} className="rounded-xl border border-slate-800 p-3">
              <div className="font-medium text-white">
                {row.user.arabicName} @{row.user.username}
              </div>
              <div>
                إعلانات محذوفة برسوم مستحقة: {row.deletedUnpaidCount} — الإجمالي:{' '}
                {row.outstandingTotal.toLocaleString('ar-SA')} ر.س — الحساب:{' '}
                {row.user.isActive ? 'نشط' : 'مغلق'}
              </div>
              {row.previousActions[0] ? (
                <div className="mt-1 text-slate-500">
                  آخر إجراء: {row.previousActions[0].action} — {row.previousActions[0].reason}
                </div>
              ) : null}
              {row.user.isActive ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-red-300 underline"
                  onClick={async () => {
                    const reason = window.prompt(
                      'سبب إغلاق الحساب (لن يُنفَّذ تلقائياً بدون هذا السبب)',
                    );
                    if (!reason || reason.trim().length < 4) return;
                    const admin = await import('@/services/admin.service');
                    await admin.closeAccountForListingFees(row.user.id, reason.trim());
                    const data = await admin.fetchListingFeeCompliance();
                    setRows(data.users ?? []);
                  }}
                >
                  إغلاق الحساب يدوياً مع توثيق السبب
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
