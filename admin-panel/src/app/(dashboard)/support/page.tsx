'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { LifeBuoy, Ticket, BadgeCheck, HelpCircle, Activity } from 'lucide-react';
import {
  approveSafeAction,
  fetchAiDashboard,
  fetchServiceStatus,
  runTechCheck,
  setAiFlag,
  updateServiceStatus,
  type AiDashboard,
  type ServiceStatus,
} from '@/services/support.service';

const DEFAULT_OK_TEXT = 'كل الخدمات تعمل بشكل طبيعي';

const sections = [
  {
    href: '/support/tickets',
    title: 'البلاغات',
    description: 'بلاغات العملاء ومحادثة مساعد سرح وخدمة العملاء',
    icon: Ticket,
  },
  {
    href: '/support/verification',
    title: 'طلبات التوثيق',
    description: 'مراجعة طلبات توثيق الحساب',
    icon: BadgeCheck,
  },
  {
    href: '/support/faqs',
    title: 'الأسئلة الشائعة',
    description: 'قاعدة معرفة مركز المساعدة ومساعد سرح',
    icon: HelpCircle,
  },
];

function AiControlCard() {
  const [data, setData] = useState<AiDashboard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    void fetchAiDashboard()
      .then(setData)
      .catch(() => setMessage('تعذّر تحميل بطاقة الذكاء (يتطلب مديرًا)'));
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (name: string, enabled: boolean) => {
    setBusy(name);
    setMessage(null);
    try {
      const result = await setAiFlag(name, enabled);
      if (!result.ok && result.reason === 'env_ceiling') {
        setMessage('البيئة تطفي هذا المفتاح، والزر لا يشغّله');
      }
      load();
    } catch {
      setMessage('تعذّر تغيير المفتاح');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-white font-medium">الذكاء الاصطناعي</h2>
        <Button
          onClick={() => {
            setBusy('tech-run');
            void runTechCheck()
              .then(() => load())
              .catch(() => setMessage('تعذّر تشغيل الفحص'))
              .finally(() => setBusy(null));
          }}
          disabled={busy === 'tech-run'}
        >
          تشغيل الفحص
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {(data?.flags ?? []).map((flag) => (
          <div key={flag.name} className="rounded-xl border border-slate-800 p-3 text-sm">
            <p className="text-white">{flag.name}</p>
            <p className="text-slate-400">
              {flag.effective ? 'يعمل' : 'متوقف'}
              {!flag.envAllows ? ' — البيئة تطفيه' : ''}
              {flag.runtimeOff ? ' — إيقاف فوري' : ''}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => void toggle(flag.name, false)}
                disabled={busy === flag.name || !flag.effective}
              >
                إيقاف
              </Button>
              <Button
                onClick={() => void toggle(flag.name, true)}
                disabled={busy === flag.name || !flag.envAllows || flag.effective}
              >
                تشغيل
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-300">
        اليوم {data?.usage.day ?? '…'}: {data?.usage.tokens ?? 0} / {data?.usage.tokenBudget ?? 0} توكن،{' '}
        {data?.usage.requests ?? 0} / {data?.usage.requestLimit ?? 0} طلب. مجاب{' '}
        {data?.outcomes.answered ?? 0}، محوّل {data?.outcomes.escalated ?? 0}. رفض الوكيل{' '}
        {data?.quality ? Math.round(data.quality.rejectedRate * 100) : 0}%
        {data?.quality?.fallbackActive ? ' — رجع لمساعد سرح' : ''}. تقييم مفيد{' '}
        {data?.quality?.helpful ?? 0} / غير مفيد {data?.quality?.notHelpful ?? 0}.
      </p>
      <ul className="text-sm text-slate-400 space-y-1">
        {(data?.audit ?? []).map((row, index) => (
          <li key={`${row.tool}-${index}`}>
            {row.tool} — {row.status} — {row.resultSummary}
          </li>
        ))}
      </ul>
      <ul className="text-sm text-slate-300 space-y-2">
        {(data?.proposals ?? []).filter((item) => item.status === 'pending').map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2">
            <span>{item.action.action}</span>
            <Button onClick={() => void approveSafeAction(item.id).then(() => load())}>
              موافقة
            </Button>
          </li>
        ))}
      </ul>
      <ul className="text-sm text-slate-400 space-y-1">
        {(data?.drafts ?? []).map((draft, index) => (
          <li key={`${draft.service}-${index}`}>
            {draft.severity} {draft.service}: {draft.cause}
          </li>
        ))}
      </ul>
      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}

function ServiceStatusCard() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [state, setState] = useState<'ok' | 'degraded'>('ok');
  const [textAr, setTextAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchServiceStatus()
      .then((s) => {
        setStatus(s);
        setState(s.state);
        setTextAr(s.state === 'ok' && s.textAr === DEFAULT_OK_TEXT ? '' : s.textAr);
      })
      .catch(() => setMessage('تعذّر تحميل حالة الخدمة'));
  }, []);

  const save = async () => {
    if (state === 'degraded' && !textAr.trim()) {
      setMessage('اكتب وصف العطل قبل الحفظ');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateServiceStatus({ state, textAr: textAr.trim() || undefined });
      setStatus(next);
      setMessage('تم الحفظ');
    } catch {
      setMessage('تعذّر الحفظ (يتطلب صلاحية مدير)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-emerald-400" />
        <h2 className="text-white font-medium">حالة الخدمة في مركز المساعدة</h2>
      </div>
      <p className="text-sm text-slate-400">
        الحالي: {status ? `${status.state === 'ok' ? 'طبيعي' : 'عطل جزئي'} — ${status.textAr}` : '…'}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={state}
          onChange={(e) => setState(e.target.value as 'ok' | 'degraded')}
          className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        >
          <option value="ok">طبيعي</option>
          <option value="degraded">عطل جزئي</option>
        </select>
        <input
          value={textAr}
          onChange={(e) => setTextAr(e.target.value)}
          maxLength={160}
          placeholder={state === 'ok' ? DEFAULT_OK_TEXT : 'مثال: تأخير في وصول رسائل التحقق'}
          className="flex-1 min-w-[240px] rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        />
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
      </div>
      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}

export default function SupportHubPage() {
  return (
    <div>
      <PageHeader
        title="خدمة العملاء"
        description="البلاغات والتوثيق والأسئلة الشائعة"
      />
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/40 transition-colors"
          >
            <section.icon className="h-8 w-8 text-emerald-400 mb-4" />
            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
            <p className="text-sm text-slate-400 mt-2">{section.description}</p>
          </Link>
        ))}
      </div>
      <AiControlCard />
      <ServiceStatusCard />
      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/30 p-5 flex items-center gap-3 text-slate-400">
        <LifeBuoy className="h-5 w-5 text-emerald-400" />
        <p className="text-sm">بلاغات المحتوى (REPORT) ما زالت متاحة من قسم «البلاغات».</p>
      </div>
    </div>
  );
}
