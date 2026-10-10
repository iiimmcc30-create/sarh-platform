export const SAFE_QUEUE_NAMES = [
  'notifications',
  'emails',
  'push-notifications',
  'image-processing',
] as const;

export const SAFE_CACHE_KEYS = ['streams:live', 'posts:1'] as const;

export type SafeQueueName = (typeof SAFE_QUEUE_NAMES)[number];
export type SafeCacheKey = (typeof SAFE_CACHE_KEYS)[number];

export type SafeActionRequest =
  | { action: 'retry_failed_jobs'; queue: SafeQueueName; max: number }
  | { action: 'clear_known_cache'; cacheKey: SafeCacheKey };

const QUEUES = new Set<string>(SAFE_QUEUE_NAMES);
const CACHES = new Set<string>(SAFE_CACHE_KEYS);

/** Fixed whitelist. Payments, subscriptions, shells, and restarts are absent. */
export function parseSafeAction(input: {
  action?: string;
  queue?: string;
  cacheKey?: string;
  max?: number;
}): SafeActionRequest | null {
  if (input.action === 'retry_failed_jobs' && input.queue && QUEUES.has(input.queue)) {
    const max = Math.min(20, Math.max(1, Math.floor(input.max ?? 5)));
    return { action: 'retry_failed_jobs', queue: input.queue as SafeQueueName, max };
  }
  if (input.action === 'clear_known_cache' && input.cacheKey && CACHES.has(input.cacheKey)) {
    return { action: 'clear_known_cache', cacheKey: input.cacheKey as SafeCacheKey };
  }
  return null;
}
