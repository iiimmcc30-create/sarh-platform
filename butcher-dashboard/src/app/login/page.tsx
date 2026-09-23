'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import {
  clearSession,
  loginAndRequireButcher,
  tryRestoreSession,
} from '@/services/auth.service';
import {
  BRAND_DASHBOARD_TITLE_AR,
  BRAND_NAME_AR,
  BRAND_NAME_EN,
  BRAND_TAGLINE_AR,
} from '@/constants/brand';
import { withButcherBase } from '@/constants/butcherBasePath';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const status = await tryRestoreSession();
      if (cancelled) return;
      if (status === 'restored') {
        window.location.assign(withButcherBase('/dashboard'));
        return;
      }
      setCheckingSession(false);
    })();

    fetch('/api/health', { cache: 'no-store' })
      .then((r) => {
        if (!cancelled) setBackendDown(!r.ok);
      })
      .catch(() => {
        if (!cancelled) setBackendDown(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    clearSession();
    try {
      const fd = new FormData(e.currentTarget);
      const loginValue = String(fd.get('login') ?? login).trim();
      const passwordValue = String(fd.get('password') ?? password);
      if (!loginValue || !passwordValue) {
        setError('أدخل اسم المستخدم أو البريد وكلمة المرور');
        return;
      }
      setLogin(loginValue);
      setPassword(passwordValue);
      await loginAndRequireButcher(loginValue, passwordValue);
      window.location.assign(withButcherBase('/dashboard'));
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'فشل تسجيل الدخول');
      setError(
        message === 'بيانات الدخول غير صحيحة'
          ? 'بيانات الدخول غير صحيحة. استخدم كلمة مرور الحساب وليس رمز التحقق، وتحقق من رقم الجوال أو البريد.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <p className="text-sm text-ink-muted">جارٍ التحقق من الجلسة...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/5 bg-surface p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand">{BRAND_NAME_AR}</h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-ink-secondary">{BRAND_NAME_EN}</p>
          <p className="mt-3 text-sm text-ink-secondary">{BRAND_TAGLINE_AR}</p>
          <p className="mt-2 text-xs text-ink-muted">{BRAND_DASHBOARD_TITLE_AR}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-ink-muted">الجوال / البريد / اسم المستخدم</label>
            <input
              name="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-surface-raised px-4 py-3 text-ink outline-none focus:border-brand"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">كلمة المرور</label>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-surface-raised px-4 py-3 text-ink outline-none focus:border-brand"
              required
              autoComplete="current-password"
            />
          </div>
          {backendDown && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              تعذّر الوصول إلى واجهة سرح. تأكد أن الـ API يعمل على المنفذ 3001.
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-muted">
          نفس حساب الملحمة في تطبيق سرح: كلمة المرور وليست رمز SMS. رقم الجوال مثل 05xxxxxxxx أو
          +9665xxxxxxxx. لحسابات الملاحم المعتمدة فقط، وليست لوحة إدارة المنصة.
        </p>
      </div>
    </div>
  );
}
