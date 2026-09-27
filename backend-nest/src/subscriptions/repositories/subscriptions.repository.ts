import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SUBSCRIPTION_SELECT = {
  id: true,
  planId: true,
  planAudience: true,
  billingCycle: true,
  status: true,
  renewDate: true,
  listingsUsed: true,
  liveMinutesUsed: true,
  featuredAdsUsed: true,
  pinnedAdsUsed: true,
  dailyAdsUsed: true,
  autoRenew: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: SUBSCRIPTION_SELECT,
    });
  }

  async upsertFree(userId: string) {
    const audience = 'USER' as const;
    const freePlan = await this.prisma.plan.findUnique({
      where: { slug_audience: { slug: 'free', audience } },
    });

    return this.prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        planId: 'free',
        planAudience: audience,
        planDbId: freePlan?.id ?? null,
        renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: SUBSCRIPTION_SELECT,
    });
  }
}
