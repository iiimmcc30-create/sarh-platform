'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Warehouse,
} from 'lucide-react';
import { DASHBOARD_NAV, isNavActive, type DashboardHref } from '@/constants/nav';

const NAV_ICONS: Record<DashboardHref, typeof LayoutDashboard> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/orders': ClipboardList,
  '/dashboard/products': Package,
  '/dashboard/inventory': Warehouse,
  '/dashboard/customers': Users,
  '/dashboard/reports': BarChart3,
  '/dashboard/settings': Settings,
};

export function MobileNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-surface md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex overflow-x-auto">
        {DASHBOARD_NAV.map(({ href, label }) => {
          const Icon = NAV_ICONS[href];
          const active = isNavActive(pathname, href);
          return (
            <li key={href} className="min-w-[4.5rem] flex-1">
              <Link
                href={href}
                className={clsx(
                  'flex min-h-[48px] flex-col items-center justify-center gap-1 px-2 py-2 text-[11px]',
                  active ? 'text-brand' : 'text-ink-muted',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
