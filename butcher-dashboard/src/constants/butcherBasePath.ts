/** Empty in local/dev; `/butcher` when served on sarhsa.online/butcher. */
export const BUTCHER_BASE_PATH = (
  process.env.NEXT_PUBLIC_BUTCHER_BASE_PATH || ''
).replace(/\/$/, '');

export function withButcherBase(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!BUTCHER_BASE_PATH) return p;
  if (p === '/') return `${BUTCHER_BASE_PATH}/`;
  return `${BUTCHER_BASE_PATH}${p}`;
}
