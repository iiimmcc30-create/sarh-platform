'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import {
  deactivatePlan,
  duplicatePlan,
  deletePlan,
  fetchPlans,
  type AdminPlan,
} from '@/services/admin.service';

export default function PlansPage() {
  const router = useRouter();
  const [audience, setAudience] = useState<'USER' | 'BUTCHER' | 'ALL'>('ALL');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'USER', 'BUTCHER'] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAudience(a)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              audience === a
                ? 'bg-emerald-600/20 text-emerald-300'
                : 'bg-slate-900 text-slate-400'
            }`}
          >
            {a === 'ALL' ? 'الكل' : a === 'USER' ? 'المستخدمون' : 'الملاحم'}
          </button>
        ))}
        <Button className="mr-auto" onClick={() => router.push('/plans/new')}>
          إنشاء باقة
        </Button>
      </div>

      <ResourcePage<AdminPlan>
        title="إدارة الباقات"
        description="الباقات والصلاحيات من قاعدة البيانات"
        fetchPage={async () => {
          const data = await fetchPlans(audience === 'ALL' ? undefined : audience);
          return {
            items: data.plans,
            total: data.plans.length,
            page: 1,
            pageSize: data.plans.length,
            totalPages: 1,
          };
        }}
        columns={[
          { key: 'name', label: 'الاسم' },
          { key: 'slug', label: 'المعرّف' },
          {
            key: 'audience',
            label: 'الجمهور',
            render: (r) => (
              <Badge tone={r.audience === 'BUTCHER' ? 'warning' : 'default'}>
                {r.audience === 'BUTCHER' ? 'الملاحم' : 'المستخدمون'}
              </Badge>
            ),
          },
          {
            key: 'monthlyPrice',
            label: 'شهري',
            render: (r) => `${r.monthlyPrice} ${r.currency}`,
          },
          {
            key: 'isActive',
            label: 'الحالة',
            render: (r) => (
              <Badge tone={r.isActive ? 'success' : 'default'}>
                {r.isActive ? 'نشط' : 'معطّل'}
              </Badge>
            ),
          },
        ]}
        actions={(row, reload) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/plans/${row.id}`)}
            >
              تعديل
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await duplicatePlan(row.id);
                reload();
              }}
            >
              نسخ
            </Button>
            {row.isActive && row.slug !== 'free' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await deactivatePlan(row.id);
                  reload();
                }}
              >
                تعطيل
              </Button>
            ) : null}
            {row.slug !== 'free' ? (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                try {
                  await deletePlan(row.id);
                  reload();
                } catch {
                  alert('لا يمكن حذف باقة مستخدمة');
                }
              }}
            >
              حذف
            </Button>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}
