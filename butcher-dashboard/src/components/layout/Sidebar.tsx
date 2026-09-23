'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Bell,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Store,
  Users,
  Warehouse,
  BarChart3,
} from 'lucide-react';
import { DASHBOARD_NAV, isNavActive, type DashboardHref } from '@/constants/nav';
import { BRAND_DASHBOARD_TITLE_AR, BRAND_NAME_AR, BRAND_NAME_EN } from '@/constants/brand';
import { logoutQuietly } from '@/services/auth.service';
import { withButcherBase } from '@/constants/butcherBasePath';
import { useButcherSession } from './ButcherSessionProvider';

const NAV_ICONS: Record<DashboardHref, typeof LayoutDashboard> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/orders': ClipboardList,
  '/dashboard/products': Package,
  '/dashboard/inventory': Warehouse,
  '/dashboard/customers': Users,
  '/dashboard/reports': BarChart3,
  '/dashboard/settings': Settings,
};

export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { butcher } = useButcherSession();
  const open = butcher?.isOpen === true;

  return (
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-e border-white/5 bg-surface md:flex">
      <div className="border-b border-white/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-sm font-bold text-brand">
            {BRAND_NAME_AR.slice(0, 1)}
          </div>
          <div>
            <p className="text-base font-semibold text-ink">{BRAND_NAME_AR}</p>
            <p className="text-xs text-ink-muted">{BRAND_NAME_EN} · {BRAND_DASHBOARD_TITLE_AR}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface-raised px-3 py-3">
          <p className="truncate text-sm font-medium text-ink">{butcher?.nameAr ?? '—'}</p>
          <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <Store className="h-3.5 w-3.5" aria-hidden />
            <span className={open ? 'text-brand' : 'text-ink-muted'}>
              {open ? 'الملحمة مفتوحة' : 'الملحمة مغلقة'}
            </span>
          </p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {DASHBOARD_NAV.map(({ href, label }) => {
          const Icon = NAV_ICONS[href];
          const active = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                active
                  ? 'bg-brand/15 text-brand'
                  : 'text-ink-secondary hover:bg-surface-overlay hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-4">
        <button
          type="button"
          onClick={() => {
            void logoutQuietly().finally(() => {
              window.location.href = withButcherBase('/login');
            });
          }}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-rose-400 hover:bg-surface-overlay"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}

export function HeaderBell({ count }: { count: number }) {
  return (
    <span className="relative inline-flex text-ink-secondary">
      <Bell className="h-5 w-5" aria-hidden />
      {count > 0 ? (
        <span className="absolute -top-1 -start-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 text-ink">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </span>
  );
}
