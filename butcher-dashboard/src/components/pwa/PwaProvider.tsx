'use client';

import { useEffect } from 'react';
import { registerButcherServiceWorker } from '@/lib/register-sw';
import { InstallPrompt } from './InstallPrompt';
import { OfflineBanner } from './OfflineBanner';

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void registerButcherServiceWorker().catch(() => undefined);
  }, []);

  return (
    <>
      <OfflineBanner />
      <InstallPrompt />
      {children}
    </>
  );
}
