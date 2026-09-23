'use client';

import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { ButcherSessionProvider, useButcherSession } from './ButcherSessionProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useButcherLiveSocket } from '@/hooks/useButcherLiveSocket';

function LiveSocketBridge() {
  const { butcher } = useButcherSession();
  useButcherLiveSocket(butcher?.id ?? null);
  return null;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ButcherSessionProvider>
        <LiveSocketBridge />
        <div className="flex min-h-dvh bg-canvas">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <main className="flex-1 overflow-auto p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6 lg:p-8">
              {children}
            </main>
          </div>
          <MobileNav />
        </div>
      </ButcherSessionProvider>
    </ToastProvider>
  );
}
