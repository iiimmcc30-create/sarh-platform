import {
  createBullmqClient,
  getBullmqSharedConnection,
} from '../redis/redis-connection';

export const isRedisEnabled = () => process.env.REDIS_ENABLED !== 'false';

/**
 * Shared BullMQ root config. Queues reuse one ioredis command client via
 * `createClient`. Subscriber is shared; blocking clients are duplicated.
 * Connection is created lazily so importing this module does not open Redis.
 */
export function bullRootConfig() {
  return {
    connection: getBullmqSharedConnection(),
    createClient: createBullmqClient,
  };
}

export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  EMAILS: 'emails',
  PUSH: 'push-notifications',
  FEE_CHECKS: 'fee-checks',
  IMAGE_PROCESSING: 'image-processing',
  SUBSCRIPTIONS: 'subscriptions',
} as const;
