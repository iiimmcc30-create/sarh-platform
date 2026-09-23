/** Empty in local/dev; `/admin` when the panel is served on sarhsa.online/admin. */
export function getAdminBasePath(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || '').replace(/\/$/, '');
}

export const ADMIN_BASE_PATH = getAdminBasePath();

export function withAdminBase(path: string): string {
  const base = getAdminBasePath();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p;
  if (p === '/') return `${base}/`;
  return `${base}${p}`;
}

/** Absolute login path for middleware/browser redirects (never root `/login` under basePath). */
export function adminLoginPath(): string {
  return withAdminBase('/login');
}
