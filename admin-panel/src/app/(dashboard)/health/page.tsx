'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, HardDrive, Layers, Server } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumbs, PageState } from '@/components/ui/AdminChrome';
import { fetchSystemHealth, type HealthPayload } from '@/services/dashboard.service';

type ServiceCard = {
  key: string;
  title: string;
  icon: typeof Database;
  ok?: boolean;
  detail?: string;
};

function statusTone(ok: boolean | undefined): 'success' | 'danger' | 'default' {
  if (ok === true) return 'success';
  if (ok === false) return 'danger';
  return 'default';
}

function statusLabel(ok: boolean | undefined) {
  if (ok === true) return 'Healthy';
  if (ok === false) return 'Down';
  return 'Unknown';
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const health = await fetchSystemHealth();
      setData(health);
      setCheckedAt(new Date().toISOString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذّر فحص الصحة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checks = data?.checks ?? {};
  const cards: ServiceCard[] = [
    {
      key: 'db',
      title: 'PostgreSQL',
      icon: Database,
      ok: checks.db,
      detail: 'قاعدة البيانات الأساسية',
    },
    {
      key: 'redis_cache',
      title: 'Redis Cache',
      icon: HardDrive,
      ok: checks.redis_cache,
      detail: 'طبقة التخزين المؤقت',
    },
    {
      key: 'redis_session',
      title: 'Redis Session',
      icon: HardDrive,
      ok: checks.redis_session,
      detail: 'جلسات ومعدّلات الطلب',
    },
    {
      key: 'queue',
      title: 'Queue',
      icon: Layers,
      ok: checks.queue,
      detail: 'طوابير BullMQ',
    },
    {
      key: 'worker',
      title: 'Worker',
      icon: Server,
      ok: checks.worker,
      detail: checks.worker === undefined ? 'غير متوفر في الاستجابة' : 'نبضة العامل',
    },
    {
      key: 'api',
      title: 'API',
      icon: Activity,
      ok: data ? data.status === 'ok' || checks.db === true : undefined,
      detail: data?.duration ? `زمن الفحص ${data.duration}` : 'استجابة /api/health',
    },
  ];

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'لوحة التحكم', href: '/' },
          { label: 'صحة النظام' },
        ]}
      />
      <PageHeader
        title="صحة النظام"
        description="مراقبة الخدمات من /api/health — بدون أسرار أو مفاتيح"
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            إعادة الفحص
          </Button>
        }
      />

      {error ? <PageState kind="error" message={error} /> : null}
      {loading && !data ? <PageState kind="loading" message="جارٍ الفحص..." /> : null}

      {data ? (
        <>
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>
              الحالة العامة:{' '}
              <Badge tone={data.status === 'ok' ? 'success' : 'danger'}>{data.status}</Badge>
            </span>
            <span>آخر فحص: {checkedAt ? new Date(checkedAt).toLocaleString('ar-SA') : '—'}</span>
            <span>وقت الخادم: {data.timestamp ? new Date(data.timestamp).toLocaleString('ar-SA') : '—'}</span>
            <span>الإصدار: {data.version ?? '—'}</span>
            <span>البناء: {data.build ?? '—'}</span>
            {typeof data.uptime === 'number' ? <span>Uptime: {data.uptime}s</span> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-emerald-400" />
                      <h2 className="font-semibold text-white">{card.title}</h2>
                    </div>
                    <Badge tone={statusTone(card.ok)}>{statusLabel(card.ok)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{card.detail}</p>
                  <p className="mt-2 text-xs text-slate-600">
                    لا تُعرض بيانات اعتماد أو عناوين اتصال سرية.
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-500">
            فحوصات خارجية (Cloudinary / N-Genius / Firebase / Nginx / SSL) غير مضمّنة في
            /api/health الحالي — مؤجلة لمرحلة لاحقة.
          </div>
        </>
      ) : null}
    </div>
  );
}
