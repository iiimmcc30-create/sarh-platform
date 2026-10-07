/**
 * API base fallback rules (pure — no React Native imports, unit-tested).
 *
 * Production (store builds, `!__DEV__`) and any https base never probe: they talk to the
 * Hostinger API directly. Only a dev build pointed at a local http backend probes it once,
 * with a short timeout, and on failure switches straight to production — no second probe.
 */

/** Live production API (Hostinger). The only remote fallback. */
export const PRODUCTION_API_BASE = 'https://sarhsa.online';

/** Local dev backend health probe — short so a missing backend never stalls boot. */
export const LOCAL_API_PROBE_TIMEOUT_MS = 1500;

export function apiFallbackMessage(productionBase: string = PRODUCTION_API_BASE): string {
  return `[سرح] Local API unreachable — switched to production (Hostinger ${productionBase})`;
}

/** True only for a dev build whose base is a local/LAN http backend. */
export function shouldProbeLocalApi(base: string, isDev: boolean): boolean {
  if (!isDev || !base) return false;
  return /^http:\/\//i.test(base.trim());
}

export type ApiHealthProbe = (baseUrl: string, timeoutMs: number) => Promise<boolean>;

/**
 * Resolve the base a dev session should use: the local backend when it answers,
 * otherwise production directly (production is always-on, so it is not probed).
 */
export async function resolveReachableApiBase(
  base: string,
  isDev: boolean,
  probe: ApiHealthProbe,
  productionBase: string = PRODUCTION_API_BASE,
): Promise<{ base: string; switched: boolean }> {
  if (!shouldProbeLocalApi(base, isDev)) return { base, switched: false };
  if (await probe(base, LOCAL_API_PROBE_TIMEOUT_MS)) return { base, switched: false };
  return { base: productionBase, switched: true };
}

// ── Request rebasing (dev only) ─────────────────────────────────────────────
// Screens build URLs from `API_BASE` before the one-time local probe finishes. Requests
// still aimed at the unreachable local base wait for the probe, then go to production
// instead of hanging until `Request timed out`.

let pendingProbe: { from: string; promise: Promise<unknown> } | null = null;
let rebase: { from: string; to: string } | null = null;

function startsWithBase(url: string, base: string): boolean {
  const b = base.replace(/\/$/, '');
  return url === b || url.startsWith(`${b}/`);
}

export function setPendingApiProbe(from: string, promise: Promise<unknown>): void {
  pendingProbe = { from, promise };
  void promise.finally(() => {
    if (pendingProbe?.promise === promise) pendingProbe = null;
  });
}

export function setApiRebase(from: string, to: string): void {
  rebase = from && to && from !== to ? { from: from.replace(/\/$/, ''), to: to.replace(/\/$/, '') } : null;
}

/** Map a request URL built from the stale local base onto the active base. */
export function rebaseApiUrl(url: string): string {
  if (!rebase || !startsWithBase(url, rebase.from)) return url;
  return rebase.to + url.slice(rebase.from.length);
}

/** Await an in-flight local probe only for URLs aimed at the probed base; then rebase. */
export async function resolveRequestUrl(url: string): Promise<string> {
  const pending = pendingProbe;
  if (pending && startsWithBase(url, pending.from)) {
    await pending.promise.catch(() => undefined);
  }
  return rebaseApiUrl(url);
}

/**
 * Socket base for a dev session. The API falls back to production when the local
 * backend is unreachable, but the socket URL used to stay on the dead local
 * `http://…:3002` (e.g. `npm run android` → 127.0.0.1), so realtime events (council
 * mic/seat updates, chat) never arrived. Follow the API: once it has switched to
 * production, a local http socket URL switches too. https / production URLs are untouched.
 */
export function resolveSocketBase(socketUrl: string): string {
  if (!rebase || !/^http:\/\//i.test(socketUrl.trim())) return socketUrl;
  return rebase.to;
}

/** Test helper. */
export function resetApiFallbackState(): void {
  pendingProbe = null;
  rebase = null;
}
