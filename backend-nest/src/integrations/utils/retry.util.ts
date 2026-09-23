import {
  NI_NO_RETRY_STATUSES,
  NI_RETRY_STATUSES,
} from '../constants/integration.constants';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableHttpStatus(status: number | undefined): boolean {
  if (status == null) return true; // network / timeout
  if (NI_NO_RETRY_STATUSES.has(status)) return false;
  return NI_RETRY_STATUSES.has(status);
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    getStatus?: (result: T) => number | undefined;
    isTimeout?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      const status = options.getStatus?.(result);
      if (status != null && isRetryableHttpStatus(status) && i < attempts - 1) {
        await sleep(baseDelayMs * 2 ** i);
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      const timeout = options.isTimeout?.(err) ?? false;
      if (!timeout && i >= attempts - 1) throw err;
      if (!timeout && !isRetryableHttpStatus(undefined)) throw err;
      if (i >= attempts - 1) throw err;
      await sleep(baseDelayMs * 2 ** i);
    }
  }

  throw lastError;
}
