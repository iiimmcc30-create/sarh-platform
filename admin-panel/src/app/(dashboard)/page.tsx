'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  FileText,
  Tag,
  Flag,
  Radio,
  ShoppingBag,
  Wallet,
  Percent,
  Store,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumbs, DeltaBadge, PageState } from '@/components/ui/AdminChrome';
import {
  fetchDashboardStats,
  type DashboardStats,
} from '@/services/dashboard.service';
import { BRAND_TAGLINE_AR } from '@/constants/brandCopy';
import { getStoredUser } from '@/services/auth.service';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

function money(n: number | undefined) {
  return `${(n ?? 0).toLocaleString('ar-SA')} ر.س`;
}

function personName(row: Record<string, unknown> | null | undefined) {
  if (!row) return '—';
  return String(row.arabicName || row.displayName || row.nameAr || '—');
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [chartWindow, setChartWindow] = useState<'7' | '30'>('7');
  const isAdmin = getStoredUser()?.role === 'ADMIN';

  useEffect(() => {
    let cancelled = false;
    fetchDashboardStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <PageState kind="error" message={error} />;
  }

  if (!stats) {
    return <PageState kind="loading" message="جارٍ تحميل مركز التشغيل..." />;
  }

  const salesSeries =
    chartWindow === '30' && stats.charts.salesByDay30?.length
      ? stats.charts.salesByDay30
      : stats.charts.salesByDay ?? [];
  const usersSeries =
    chartWindow === '30' && stats.charts.usersByDay30?.length
      ? stats.charts.usersByDay30
      : stats.charts.usersByDay;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'لوحة التحكم' }]} />
      <PageHeader
        title="مركز التشغيل"
        description={BRAND_TAGLINE_AR}
        actions={
          <div className="flex gap-2">
            <Link
              href="/health"
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-600"
            >
              صحة النظام
            </Link>
            <Link
              href="/payments"
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-600"
            >
              المدفوعات
            </Link>
            {isAdmin ? (
              <Link
                href="/commissions"
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-600"
              >
                العمولات
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="المستخدمون"
          value={stats.users.total}
          subtitle={`نشط ${stats.users.active} · جديد اليوم ${stats.users.newToday}`}
          icon={Users}
        />
        <div className="space-y-1">
          <StatCard
            title="مستخدمون جدد (7 أيام)"
            value={stats.users.newLast7Days ?? '—'}
            icon={Users}
            accent="blue"
          />
          <DeltaBadge today={stats.users.newToday} yesterday={stats.users.newYesterday} />
        </div>
        <StatCard
          title="إعلانات نشطة"
          value={stats.listings.active}
          subtitle={`اليوم +${stats.listings.newToday ?? 0} · 7 أيام +${stats.listings.newLast7Days ?? 0}`}
          icon={Tag}
          accent="amber"
        />
        <div className="space-y-1">
          <StatCard
            title="إعلانات اليوم"
            value={stats.listings.newToday ?? 0}
            icon={Tag}
            accent="amber"
          />
          <DeltaBadge
            today={stats.listings.newToday ?? 0}
            yesterday={stats.listings.newYesterday}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="الطلبات"
          value={stats.orders?.total ?? '—'}
          subtitle={`قيد التنفيذ ${stats.orders?.pending ?? '—'} · مكتمل ${stats.orders?.completed ?? '—'}`}
          icon={ShoppingBag}
          accent="violet"
        />
        <div className="space-y-1">
          <StatCard title="طلبات اليوم" value={stats.orders?.today ?? '—'} icon={ShoppingBag} />
          <DeltaBadge today={stats.orders?.today ?? 0} yesterday={stats.orders?.yesterday} />
        </div>
        <StatCard
          title="مبيعات اليوم"
          value={money(stats.sales?.today)}
          subtitle={`7 أيام ${money(stats.sales?.last7Days)} · 30 يوم ${money(stats.sales?.last30Days)}`}
          icon={Wallet}
          accent="blue"
        />
        <div className="space-y-1">
          <StatCard
            title="مبيعات أمس"
            value={money(stats.sales?.yesterday)}
            icon={Wallet}
          />
          <DeltaBadge today={stats.sales?.today ?? 0} yesterday={stats.sales?.yesterday} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="مدفوعات ناجحة"
          value={stats.payments?.successful ?? '—'}
          icon={Wallet}
          accent="blue"
        />
        <StatCard
          title="مدفوعات معلقة"
          value={stats.payments?.pending ?? '—'}
          icon={Wallet}
          accent="amber"
        />
        <StatCard
          title="مدفوعات فاشلة"
          value={stats.payments?.failed ?? '—'}
          icon={Wallet}
          accent="rose"
        />
        <StatCard
          title="بلاغات مفتوحة"
          value={stats.tickets.open}
          subtitle={`اليوم ${stats.tickets.today ?? 0} · عاجل ${stats.tickets.urgent}`}
          icon={Flag}
          accent="rose"
        />
        <StatCard
          title="الملاحم"
          value={stats.butchers.total}
          subtitle={`موثّق ${stats.butchers.verified}`}
          icon={Store}
          accent="violet"
        />
      </div>

      {isAdmin && stats.commission ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="عمولة الملاحم (داخلية)"
            value={`${stats.commission.butcherStoreRatePercent}%`}
            subtitle="رسوم إعلانات المتجر — ADMIN فقط"
            icon={Percent}
            accent="violet"
          />
          <StatCard
            title="عمولات إعلانات مدفوعة"
            value={money(stats.commission.listingFeesPaidTotal)}
            subtitle={`${stats.commission.listingFeesPaidCount} سجل`}
            icon={Percent}
          />
          <StatCard
            title="عمولات مستحقة"
            value={money(stats.commission.listingFeesOutstandingTotal)}
            subtitle={`${stats.commission.listingFeesOutstandingCount} سجل`}
            icon={Percent}
            accent="amber"
          />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-slate-500">نافذة الرسوم:</span>
        {(['7', '30'] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setChartWindow(w)}
            className={
              chartWindow === w
                ? 'rounded-lg bg-emerald-600/20 px-3 py-1 text-xs text-emerald-300'
                : 'rounded-lg border border-slate-800 px-3 py-1 text-xs text-slate-400'
            }
          >
            {w === '7' ? '7 أيام' : '30 يومًا'}
          </button>
        ))}
        <span className="text-xs text-slate-600">بدون إعادة جلب — من نفس الاستجابة</span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">المبيعات</h2>
          <div className="h-64">
            {salesSeries.length === 0 ? (
              <PageState kind="empty" message="لا بيانات مبيعات للنافذة المحددة" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">الطلبات</h2>
          <div className="h-64">
            {(stats.charts.ordersByDay?.length ?? 0) === 0 ? (
              <PageState kind="empty" message="لا بيانات طلبات" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.charts.ordersByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">مدفوعات ناجحة مقابل فاشلة</h2>
          <div className="h-64">
            {(stats.charts.paymentsByDay?.length ?? 0) === 0 ? (
              <PageState kind="empty" message="لا بيانات مدفوعات" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.charts.paymentsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                  <Legend />
                  <Bar dataKey="paid" name="ناجحة" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="فاشلة" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">مستخدمون جدد</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usersSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">البلاغات حسب التصنيف</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.charts.ticketsByCategory}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(props) => {
                    const entry = props as { category?: string; count?: number };
                    return `${entry.category ?? ''}: ${entry.count ?? 0}`;
                  }}
                >
                  {stats.charts.ticketsByCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">ملخص سريع</h2>
            <FileText className="h-4 w-4 text-slate-500" />
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex justify-between">
              <span className="text-slate-500">منشورات</span>
              <span>
                {stats.posts.total} (مخفي {stats.posts.hidden})
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-500">بث مباشر الآن</span>
              <span>
                {stats.liveStreams.liveNow} / {stats.liveStreams.total}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-500">مدفوعات مسترجعة</span>
              <span>{stats.payments?.refunded ?? '—'}</span>
            </li>
            <li className="flex items-center gap-2 text-slate-500">
              <Radio className="h-3.5 w-3.5" /> لا يوجد polling — تحديث يدوي عند فتح الصفحة
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <RecentTable
          title="أحدث الطلبات"
          href="/orders"
          empty="لا طلبات"
          rows={(stats.recent?.orders ?? []).map((o) => ({
            id: String(o.id),
            cells: [
              String(o.orderNumber ?? o.id),
              personName(o.customer as Record<string, unknown>),
              personName(o.butcher as Record<string, unknown>),
              `${o.totalPrice ?? 0} ${o.currency ?? 'SAR'}`,
              <Badge key="s">{String(o.status)}</Badge>,
              String(o.paymentStatus ?? '—'),
              new Date(String(o.createdAt)).toLocaleString('ar-SA'),
            ],
          }))}
          headers={['الطلب', 'العميل', 'الملحمة', 'المبلغ', 'الحالة', 'الدفع', 'التاريخ']}
        />
        <RecentTable
          title="أحدث المدفوعات"
          href="/payments"
          empty="لا مدفوعات"
          rows={(stats.recent?.payments ?? []).map((p) => ({
            id: String(p.id),
            cells: [
              String(p.orderId ?? p.id).slice(0, 12),
              `${p.amount ?? 0} ${p.currency ?? 'SAR'}`,
              <Badge key="s">{String(p.status)}</Badge>,
              String(p.referenceType ?? '—'),
              personName(p.user as Record<string, unknown>),
              new Date(String(p.createdAt)).toLocaleString('ar-SA'),
            ],
          }))}
          headers={['مرجع', 'المبلغ', 'الحالة', 'النوع', 'المستخدم', 'التاريخ']}
        />
        <RecentTable
          title="أحدث البلاغات"
          href="/reports"
          empty="لا بلاغات"
          rows={(stats.recent?.reports ?? []).map((r) => ({
            id: String(r.id),
            cells: [
              String(r.subject ?? r.id).slice(0, 28),
              personName(r.reporter as Record<string, unknown>),
              String(r.category ?? '—'),
              <Badge key="s">{String(r.status)}</Badge>,
              new Date(String(r.createdAt)).toLocaleString('ar-SA'),
            ],
          }))}
          headers={['البلاغ', 'المبلّغ', 'التصنيف', 'الحالة', 'التاريخ']}
        />
      </div>
    </div>
  );
}

function RecentTable({
  title,
  href,
  headers,
  rows,
  empty,
}: {
  title: string;
  href: string;
  headers: string[];
  rows: Array<{ id: string; cells: React.ReactNode[] }>;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">{title}</h2>
        <Link href={href} className="text-xs text-emerald-400 hover:underline">
          عرض الكل
        </Link>
      </div>
      {rows.length === 0 ? (
        <PageState kind="empty" message={empty} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-2 py-2 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80 text-slate-300">
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-2 py-2 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
