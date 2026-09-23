import { AdminShell } from '@/components/layout/AdminShell';

// Admin pages are behind authentication and need live data — skip static generation.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
