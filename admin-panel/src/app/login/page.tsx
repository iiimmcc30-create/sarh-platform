'use client';

import { useEffect, useState } from 'react';
import { adminLogin, persistSession, clearSession, tryRestoreSession } from '@/services/auth.service';
import { getApiErrorMessage } from '@/services/api.client';
import { withAdminBase } from '@/constants/adminBasePath';
import { Button } from '@/components/ui/Button';
import {
  BRAND_ADMIN_SUBTITLE_AR,
  BRAND_NAME_AR,
  BRAND_NAME_EN,
  BRAND_TAGLINE_AR,
} from '@/constants/brandCopy';

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
        window.location.assign(withAdminBase('/'));
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
      // Prefer FormData so browser autofill values are used even if React state lagged.
      const fd = new FormData(e.currentTarget);
      const loginValue = String(fd.get('login') ?? login).trim();
      const passwordValue = String(fd.get('password') ?? password);
      if (!loginValue || !passwordValue) {
        setError('أدخل اسم المستخدم أو البريد وكلمة المرور');
        return;
      }
      setLogin(loginValue);
      setPassword(passwordValue);
      const session = await adminLogin(loginValue, passwordValue);
      persistSession(session);
      // Full navigation so middleware receives the new admin_token cookie.
      window.location.assign(withAdminBase('/'));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'فشل تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
        <p className="text-sm text-slate-400">جارٍ التحقق من الجلسة...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-400">{BRAND_NAME_AR}</h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-emerald-300/80">{BRAND_NAME_EN}</p>
          <p className="mt-3 text-sm text-slate-300">{BRAND_TAGLINE_AR}</p>
          <p className="mt-2 text-xs text-slate-500">{BRAND_ADMIN_SUBTITLE_AR}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">البريد / اسم المستخدم</label>
            <input
              name="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onInput={(e) => setLogin((e.target as HTMLInputElement).value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-500"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">كلمة المرور</label>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-500"
              required
              autoComplete="current-password"
            />
          </div>
          {backendDown && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              الباك إند غير متصل. شغّل: <code className="text-amber-200">cd backend-nest && npm run dev:lite</code>
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-600">Admin / Moderator فقط</p>
      </div>
    </div>
  );
}
