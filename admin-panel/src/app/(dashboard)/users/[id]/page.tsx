'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fetchUser, updateUser } from '@/services/admin.service';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()!;
  const router = useRouter();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchUser(id).then((r) => setUser(r.user));
  }, [id]);

  if (!user) return <p className="text-slate-400">جارٍ التحميل...</p>;

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
