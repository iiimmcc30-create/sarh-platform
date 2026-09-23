'use client';

import { useEffect, useState } from 'react';
import { HeaderBell } from './Sidebar';
import { useButcherSession } from './ButcherSessionProvider';
import { fetchUnreadCount } from '@/services/butcher.service';

export function Header() {
  const { user, butcher } = useButcherSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className="flex min-h-16 items-center justify-between border-b border-white/5 bg-surface px-4 md:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div>
        <p className="text-sm font-medium text-ink">{butcher?.nameAr ?? 'لوحة الملحمة'}</p>
        <p className="text-xs text-ink-muted">{butcher?.cityAr || butcher?.city || ''}</p>
      </div>
      <div className="flex items-center gap-4">
        <HeaderBell count={unread} />
        <div className="text-end">
          <p className="max-w-[12rem] truncate text-sm text-ink">
            {user?.arabicName || user?.displayName || user?.username || '—'}
          </p>
          <p className="text-xs text-ink-muted">صاحب الملحمة</p>
        </div>
      </div>
    </header>
  );
}
