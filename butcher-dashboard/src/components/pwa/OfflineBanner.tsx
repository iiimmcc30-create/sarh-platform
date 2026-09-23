'use client';

import { useEffect, useState } from 'react';
import { isBrowserOnline } from '@/lib/pwa';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!isBrowserOnline());
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      أنت غير متصل. لا نعرض بيانات قديمة، ولا يمكن تنفيذ عمليات مثل تغيير حالة الطلب حتى تعود الشبكة.
    </div>
  );
}
