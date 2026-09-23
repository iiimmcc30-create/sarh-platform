/** Development-only timing. Never logs in production builds. */

const startedAt = Date.now();

export function markPerf(label: string): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[sarh-perf] ${label} +${Date.now() - startedAt}ms`);
}
