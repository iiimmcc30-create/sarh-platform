'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  startTwoFactorSetup,
  type TwoFactorStatus,
} from '@/services/auth.service';

/** Group a base32 secret in blocks of 4 for manual entry. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export default function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await fetchTwoFactorStatus());
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذّر تحميل حالة التحقق بخطوتين'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(getApiErrorMessage(err, 'حدث خطأ، حاول مجدداً'));
    } finally {
      setBusy(false);
    }
  };

  const onStart = () =>
    run(async () => {
      setSetup(await startTwoFactorSetup());
      setCode('');
    });

  const onEnable = () =>
    run(async () => {
      await enableTwoFactor(code);
      setSetup(null);
      setCode('');
      setNotice('تم تفعيل التحقق بخطوتين. سيُطلب الرمز في كل تسجيل دخول.');
      await load();
    });

  const onDisable = () =>
    run(async () => {
      await disableTwoFactor(code);
      setCode('');
      setNotice('تم إيقاف التحقق بخطوتين.');
      await load();
    });

  const codeInput = (
    <input
      value={code}
      onChange={(e) => setCode(e.target.value)}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      dir="ltr"
      placeholder="000000"
      className="w-40 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-center text-lg tracking-[0.4em] text-white outline-none focus:border-emerald-500"
    />
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="الأمان والتحقق بخطوتين"
        description="احمِ حسابك في لوحة التحكم برمز من تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password) إضافةً إلى كلمة المرور."
      />

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-300">الحالة</p>
          {status === null ? (
            <span className="text-sm text-slate-500">…</span>
          ) : status.enabled ? (
            <span className="rounded-full bg-emerald-600/15 px-3 py-1 text-sm text-emerald-300">مفعّل</span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-300">غير مفعّل</span>
          )}
        </div>

        {status && !status.enabled && !setup && (
          <Button onClick={onStart} disabled={busy}>
            تفعيل التحقق بخطوتين
          </Button>
        )}

        {setup && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-2 pr-5 text-sm text-slate-300">
              <li>افتح تطبيق المصادقة واختر «إضافة حساب» ثم «إدخال مفتاح الإعداد».</li>
              <li>
                أدخل هذا المفتاح (نوع الحساب: حسب الوقت):
                <code
                  dir="ltr"
                  className="mt-2 block select-all rounded-lg bg-slate-950 px-3 py-2 text-center font-mono text-base tracking-wider text-emerald-300"
                >
                  {groupSecret(setup.secret)}
                </code>
                <span className="mt-1 block text-xs text-slate-500">
                  أو افتح{' '}
                  <a href={setup.otpauthUrl} className="text-emerald-400 underline">
                    رابط الإعداد
                  </a>{' '}
                  من جوال فيه تطبيق المصادقة.
                </span>
              </li>
              <li>اكتب الرمز المكوّن من ٦ أرقام الذي يظهر في التطبيق:</li>
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              {codeInput}
              <Button onClick={onEnable} disabled={busy || code.trim().length < 6}>
                تأكيد وتفعيل
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)} disabled={busy}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {status?.enabled && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              لإيقاف التحقق بخطوتين أدخل رمزاً حالياً من تطبيق المصادقة. إذا فقدت جوالك، يستطيع مسؤول (ADMIN) آخر إعادة ضبطه لك.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {codeInput}
              <Button variant="danger" onClick={onDisable} disabled={busy || code.trim().length < 6}>
                إيقاف التحقق بخطوتين
              </Button>
            </div>
          </div>
        )}

        {notice && <p className="text-sm text-emerald-300">{notice}</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
