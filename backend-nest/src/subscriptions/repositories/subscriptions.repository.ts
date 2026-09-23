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
    const role = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, butcherProfile: { select: { id: true } } },
    });
    const audience =
      role?.role === 'BUTCHER' || role?.butcherProfile ? 'BUTCHER' : 'USER';
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

  /**
   * Butcher accounts approved after signup may still have USER planAudience.
   * Align subscription row with butcher catalog so UI and payments use BUTCHER plans.
   */
  async syncPlanAudienceForButcherAccount(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        butcherProfile: { select: { id: true } },
      },
    });
    const isButcher = user?.role === 'BUTCHER' || user?.butcherProfile != null;
    if (!isButcher) return false;

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub || sub.planAudience === 'BUTCHER') return false;

    const mapPlanSlug = async (slug: string): Promise<string> => {
      if (slug === 'free') return 'free';

      const existingButcher = await this.prisma.plan.findUnique({
        where: { slug_audience: { slug, audience: 'BUTCHER' } },
        select: { slug: true },
      });
      if (existingButcher) return existingButcher.slug;

      const paidButcher = await this.prisma.plan.findFirst({
        where: { audience: 'BUTCHER', isActive: true, monthlyPrice: { gt: 0 } },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true },
      });
      return paidButcher?.slug ?? 'free';
    };

    const newSlug = await mapPlanSlug(sub.planId);
    const butcherPlan = await this.prisma.plan.findUnique({
      where: { slug_audience: { slug: newSlug, audience: 'BUTCHER' } },
    });

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        planAudience: 'BUTCHER',
        planId: newSlug,
        planDbId: butcherPlan?.id ?? sub.planDbId,
      },
    });
    return true;
  }
}
