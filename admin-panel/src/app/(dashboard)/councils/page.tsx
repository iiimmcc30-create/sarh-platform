'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  closeAdminCouncil,
  fetchAdminCouncils,
  setAdminCouncilGolden,
  type AdminCouncil,
} from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';
import { getStoredUser } from '@/services/auth.service';

const STATUS_LABEL: Record<AdminCouncil['status'], string> = {
  LIVE: '● مباشر',
  SCHEDULED: 'مجدول',
  ENDED: 'منتهي',
};

function hostName(c: AdminCouncil) {
  return c.owner.arabicName || c.owner.displayName || c.owner.username;
}

export default function CouncilsPage() {
  const [items, setItems] = useState<AdminCouncil[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('LIVE');
  const [golden, setGolden] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = getStoredUser()?.role === 'ADMIN';

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAdminCouncils({ status, golden, q, cursor: after });
        setItems((prev) => (after ? [...prev, ...data.councils] : data.councils));
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, 'تعذّر تحميل المجالس'));
      } finally {
        setLoading(false);
      }
    },
    [status, golden, q],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  async function toggleGolden(c: AdminCouncil) {
    const next = !c.golden;
    const msg = next
      ? 'تفعيل المجلس الذهبي؟ (الكاميرا وعرض الصور للبائعين الموثّقين)'
      : 'إلغاء المجلس الذهبي؟ ستُسحب الكاميرا وتُزال الصور المعروضة فوراً.';
    if (!confirm(msg)) return;
    setBusyId(c.id);
    try {
      await setAdminCouncilGolden(c.id, next);
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, golden: next } : x)));
    } catch (e: unknown) {
      alert(getApiErrorMessage(e, 'تعذّر تغيير الفئة'));
    } finally {
      setBusyId(null);
    }
  }

  async function forceClose(c: AdminCouncil) {
    const reason = prompt(`إغلاق «${c.name}» فوراً؟ سيُخرج جميع الحاضرين. سبب الإغلاق (اختياري):`);
    if (reason === null) return;
    setBusyId(c.id);
    try {
      await closeAdminCouncil(c.id, reason || undefined);
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: 'ENDED' } : x)));
    } catch (e: unknown) {
      alert(getApiErrorMessage(e, 'تعذّر إغلاق المجلس'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="المجالس الصوتية" description="عرض المجالس، تفعيل المجلس الذهبي، والإغلاق الإجباري" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="LIVE">مباشر</option>
          <option value="SCHEDULED">مجدول</option>
          <option value="ENDED">منتهي</option>
        </select>
        <select
          value={golden}
          onChange={(e) => setGolden(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">كل الفئات</option>
          <option value="true">ذهبي</option>
          <option value="false">عادي</option>
        </select>
      </div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-3">المجلس</th>
              <th className="p-3">المضيف</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الحاضرون</th>
              <th className="p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-800">
                <td className="p-3">{c.name}</td>
                <td className="p-3">
                  {hostName(c)} {c.owner.verified ? '✓' : ''}
                </td>
                <td className="p-3">
                  <Badge tone={c.status === 'LIVE' ? 'danger' : 'default'}>{STATUS_LABEL[c.status]}</Badge>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Badge tone={c.visibility === 'PRIVATE' ? 'warning' : 'default'}>
                      {c.visibility === 'PRIVATE' ? '🔒 خاص' : 'عام'}
                    </Badge>
                    {c.golden && <Badge tone="warning">ذهبي</Badge>}
                  </div>
                </td>
                <td className="p-3">{c.presentNow}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {isAdmin && c.status !== 'ENDED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => void toggleGolden(c)}
                      >
                        {c.golden ? 'إلغاء الذهبي' : 'تفعيل الذهبي'}
                      </Button>
                    )}
                    {c.status !== 'ENDED' && (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => void forceClose(c)}
                      >
                        إغلاق
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500">
                  لا توجد مجالس
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-4">
          <Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>
            {loading ? '...' : 'تحميل المزيد'}
          </Button>
        </div>
      )}
    </div>
  );
}
