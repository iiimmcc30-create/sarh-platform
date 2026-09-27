import { Injectable } from '@nestjs/common';
import {
  getSubscriptionStatus,
  isPaidPlan,
} from '../lib/subscription-lifecycle';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { SubscriptionLifecycleService } from './services/subscription-lifecycle.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly cache: RedisCacheService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async getMine(user: JwtPayload) {
    let subscription = await this.repo.findByUserId(user.userId);
    if (!subscription) {
      subscription = await this.repo.upsertFree(user.userId);
    }

    const view = await this.lifecycle.getForUser(user.userId);
    const payload = view ?? {
      ...subscription,
      status: 'active' as const,
      effectivePlanId: subscription.planId,
    };

    const cacheKey = `subscription:${user.userId}`;
    await this.cache.set(cacheKey, payload, 120);
    return payload;
  }

  isSubscriptionCacheStale(cached: {
    planId: string;
    renewDate: string | Date;
    autoRenew: boolean;
  }): boolean {
    if (!isPaidPlan(cached.planId)) return false;
    const renewDate =
      cached.renewDate instanceof Date
        ? cached.renewDate
        : new Date(cached.renewDate);
    return (
      getSubscriptionStatus({
        planId: cached.planId,
        renewDate,
        autoRenew: cached.autoRenew,
      }) === 'expired'
    );
  }
}
