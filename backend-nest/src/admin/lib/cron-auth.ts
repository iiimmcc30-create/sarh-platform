import { timingSafeEqual as nodeTimingSafeEqual } from 'crypto';

/** Constant-time string compare. Different lengths still return false. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    nodeTimingSafeEqual(left, left);
    return false;
  }
  return nodeTimingSafeEqual(left, right);
}

export type CronCleanupAuth = 'cron_ok' | 'need_admin' | 'unconfigured';

export function authorizeCronCleanup(params: {
  expectedSecret: string | undefined;
  providedSecret: string | undefined;
  nodeEnv: string | undefined;
}): CronCleanupAuth {
  const expected = params.expectedSecret?.trim() ?? '';
  const provided = params.providedSecret?.trim() ?? '';
  const production = params.nodeEnv === 'production';

  if (!expected) {
    return production ? 'unconfigured' : 'need_admin';
  }
  if (provided && timingSafeStringEqual(provided, expected)) {
    return 'cron_ok';
  }
  return 'need_admin';
}

/** Skip the request entirely when the secret is missing so we never send an empty header. */
export function cronCleanupAuthHeader(
  secret: string | undefined,
): { 'x-cron-secret': string } | null {
  const trimmed = secret?.trim() ?? '';
  if (!trimmed) return null;
  return { 'x-cron-secret': trimmed };
}
