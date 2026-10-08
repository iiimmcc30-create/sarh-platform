'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fetchUser, updateUser } from '@/services/admin.service';
import {
  type AdminMembership,
  formatDate,
  badgeColor,
  planLabel,
  subscriptionStatus,
  tierLabel,
  VERIFICATION_STATE_LABEL,
  VERIFICATION_STATE_TONE,
} from '@/lib/membership';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchUser(id).then((r) => setUser(r.user));
  }, [id]);

  if (!user) return <p className="text-slate-400">جارٍ التحميل...</p>;

  const membership = user.membership as AdminMembership | undefined;
  const subStatus = subscriptionStatus(membership);

  return (
    <div>
      <PageHeader
        title={String(user.arabicName)}
        description={`@${String(user.username)}`}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            رجوع
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <p><span className="text-slate-500">البريد:</span> {String(user.email ?? '—')}</p>
          <p><span className="text-slate-500">الجوال:</span> {String(user.phone ?? '—')}</p>
          <p><span className="text-slate-500">الدور:</span> <Badge>{String(user.role)}</Badge></p>
          <p><span className="text-slate-500">التحقق:</span> {user.verified ? '✓' : '—'}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-3 font-semibold">إحصائيات</h3>
          <pre className="text-xs text-slate-400 overflow-auto">{JSON.stringify(user._count, null, 2)}</pre>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3 md:col-span-2">
          <h3 className="font-semibold">التوثيق والاشتراك</h3>
          {membership ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <p>
                <span className="text-slate-500">شارة التوثيق: </span>
                {membership.badge.visible ? (
                  <Badge tone={badgeColor(membership.badge.color ?? membership.badge.tier) === 'gold' ? 'warning' : 'info'}>
                    {tierLabel(membership.badge.tier)}
                    {membership.badge.legacy ? ' (توثيق قديم)' : ''}
                  </Badge>
                ) : (
                  'غير ظاهرة'
                )}
              </p>
              <p>
                <span className="text-slate-500">حالة التوثيق: </span>
                <Badge tone={VERIFICATION_STATE_TONE[membership.verification.state]}>
                  {VERIFICATION_STATE_LABEL[membership.verification.state]}
                </Badge>
              </p>
              <p>
                <span className="text-slate-500">الشارة المطلوبة: </span>
                {tierLabel(membership.verification.requestedTier)}
              </p>
              <p>
                <span className="text-slate-500">الشارة المعتمدة: </span>
                {tierLabel(membership.verification.approvedTier)}
              </p>
              <p>
                <span className="text-slate-500">الباقة: </span>
                {planLabel(membership)}
                {membership.subscription.monthlyPrice
                  ? ` — ${membership.subscription.monthlyPrice} ${membership.subscription.currency ?? 'SAR'} / شهر`
                  : ''}
              </p>
              <p>
                <span className="text-slate-500">حالة الاشتراك: </span>
                <Badge tone={subStatus.tone}>{subStatus.label}</Badge>
              </p>
              <p>
                <span className="text-slate-500">بداية الفترة الحالية: </span>
                {formatDate(membership.subscription.startedAt)}
              </p>
              <p>
                <span className="text-slate-500">تاريخ التجديد / الانتهاء: </span>
                {formatDate(membership.subscription.renewDate)}
              </p>
              <p>
                <span className="text-slate-500">التجربة المجانية: </span>
                {membership.subscription.trialStartedAt
                  ? `استُخدمت (${formatDate(membership.subscription.trialStartedAt)} – ${formatDate(membership.subscription.trialEndsAt)})`
                  : 'لم تُستخدم'}
              </p>
              <p className="text-xs text-slate-500 sm:col-span-2">
                التجديد يدوي شهرياً (دفعة جديدة)، ولا يوجد خصم تلقائي من البطاقة. تظهر الشارة فقط عند قبول التوثيق
                ووجود اشتراك فعّال.
              </p>
            </div>
          ) : (
            <p className="text-slate-500">لا توجد بيانات</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            await updateUser(id, { verified: !user.verified });
            const r = await fetchUser(id);
            setUser(r.user);
          }}
        >
          {user.verified ? 'إلغاء التحقق' : 'توثيق الحساب'}
        </Button>
      </div>
    </div>
  );
}
