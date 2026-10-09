import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  MANAGE_IN_STORE_MESSAGE_AR,
  resolveBilling,
  type ActiveStoreSubscription,
  type BillingInfo,
} from './subscription-billing';

@Injectable()
export class SubscriptionBillingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Latest ACTIVE App Store / Google Play subscription of the user, if any. */
  async findActiveStoreSubscription(
    userId: string,
  ): Promise<ActiveStoreSubscription | null> {
    const row = await this.prisma.storePurchase.findFirst({
      where: { userId, productKind: 'subscription', status: 'active' },
      orderBy: [{ expiresAt: 'desc' }, { updatedAt: 'desc' }],
      select: { platform: true, autoRenew: true, expiresAt: true },
    });
    if (!row) return null;
    return {
      platform: row.platform,
      autoRenew: row.autoRenew,
      expiresAt: row.expiresAt,
    };
  }

  async getForUser(userId: string): Promise<BillingInfo> {
    const [subscription, store] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { userId },
        select: {
          planId: true,
          renewDate: true,
          autoRenew: true,
          status: true,
        },
      }),
      this.findActiveStoreSubscription(userId),
    ]);
    return resolveBilling({ subscription, store });
  }

  /**
   * Store subscriptions renew in the store: our cancel endpoint would only
   * flip a local flag while Apple / Google keep charging, so refuse it.
   */
  async assertNotStoreBilled(userId: string): Promise<void> {
    const store = await this.findActiveStoreSubscription(userId);
    if (store) {
      throwApi(
        409,
        'manage_in_store',
        MANAGE_IN_STORE_MESSAGE_AR[store.platform],
        {
          platform: store.platform,
        },
      );
    }
  }
}
