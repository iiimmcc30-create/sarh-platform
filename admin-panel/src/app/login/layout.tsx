// Login route is client-only (uses localStorage, cookies) — skip static generation.
export const dynamic = 'force-dynamic';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
