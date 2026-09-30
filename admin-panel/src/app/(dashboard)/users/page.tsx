'use client';

import Link from 'next/link';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { fetchUsers, updateUser, deleteUser } from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';
import {
  type AdminMembership,
  formatDate,
  badgeColor,
  planLabel,
  planPriceLabel,
  subscriptionStatus,
  tierLabel,
  VERIFICATION_STATE_LABEL,
  VERIFICATION_STATE_TONE,
} from '@/lib/membership';

type UserRow = {
  id: string;
  username: string;
  arabicName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  verified: boolean;
  verifiedTier?: string | null;
  createdAt: string;
  membership?: AdminMembership;
};

export default function UsersPage() {
  return (
    <ResourcePage<UserRow>
      title="إدارة المستخدمين"
      description="عرض وتعديل وحظر المستخدمين"
      fetchPage={({ page, search }) => fetchUsers({ page, search })}
      columns={[
        { key: 'arabicName', label: 'الاسم' },
        { key: 'username', label: 'المستخدم' },
        { key: 'email', label: 'البريد' },
        {
          key: 'role',
          label: 'الدور',
          render: (r) => <Badge tone="info">{r.role}</Badge>,
        },
        {
          key: 'isActive',
          label: 'الحالة',
          render: (r) => (
            <Badge tone={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'نشط' : 'محظور'}</Badge>
          ),
        },
        {
          key: 'badge',
          label: 'شارة التوثيق',
          render: (r) =>
            r.membership?.badge.visible ? (
              <Badge tone={badgeColor(r.membership.badge.color ?? r.membership.badge.tier) === 'gold' ? 'warning' : 'info'}>
                {tierLabel(r.membership.badge.tier)}
                {r.membership.badge.legacy ? ' (قديمة)' : ''}
              </Badge>
            ) : (
              '—'
            ),
        },
        {
          key: 'verification',
          label: 'التوثيق',
          render: (r) =>
            r.membership ? (
              <Badge tone={VERIFICATION_STATE_TONE[r.membership.verification.state]}>
                {VERIFICATION_STATE_LABEL[r.membership.verification.state]}
              </Badge>
            ) : (
              '—'
            ),
        },
        {
          key: 'subscription',
          label: 'الاشتراك',
          render: (r) => {
            const st = subscriptionStatus(r.membership);
            return (
              <div className="space-y-1">
                <div className="text-xs text-slate-400">{planLabel(r.membership)}</div>
                {planPriceLabel(r.membership) ? (
                  <div className="text-xs text-slate-500">{planPriceLabel(r.membership)}</div>
                ) : null}
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
            );
          },
        },
        {
          key: 'renewDate',
          label: 'البداية / التجديد',
          render: (r) => (
            <div className="text-xs text-slate-300">
              <div>{formatDate(r.membership?.subscription.startedAt)}</div>
              <div>{formatDate(r.membership?.subscription.renewDate)}</div>
            </div>
          ),
        },
      ]}
      actions={(row, reload) => (
        <div className="flex flex-wrap gap-2">
          <Link href={`/users/${row.id}`}>
            <Button variant="ghost" size="sm">
              تفاصيل
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await updateUser(row.id, { isActive: !row.isActive });
              reload();
            }}
          >
            {row.isActive ? 'حظر' : 'فك الحظر'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (!confirm('أرشفة المستخدم؟ سيُعطّل الحساب ويختفي من القائمة.')) return;
              try {
                await deleteUser(row.id);
                reload();
              } catch (err) {
                alert(getApiErrorMessage(err, 'فشل حذف المستخدم'));
              }
            }}
          >
            أرشفة
          </Button>
        </div>
      )}
    />
  );
}
