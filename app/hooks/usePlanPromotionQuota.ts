import { useMemo } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';

function readLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function usePlanPromotionQuota() {
  const { subscription } = useSubscription();

  return useMemo(() => {
    const featuredLimit = readLimit(subscription.permissions.monthlyFeaturedAds);
    const pinnedLimit = readLimit(subscription.permissions.monthlyPinnedAds);
    const featuredUsed = subscription.usageCounters.featuredAdsUsed ?? 0;
    const pinnedUsed = subscription.usageCounters.pinnedAdsUsed ?? 0;

    const featuredRemaining =
      featuredLimit > 0 ? Math.max(0, featuredLimit - featuredUsed) : 0;
    const pinnedRemaining =
      pinnedLimit > 0 ? Math.max(0, pinnedLimit - pinnedUsed) : 0;

    return {
      planSlug: subscription.planSlug,
      isPaid: subscription.planSlug !== 'free',
      featuredLimit,
      pinnedLimit,
      featuredUsed,
      pinnedUsed,
      featuredRemaining,
      pinnedRemaining,
      canFeature: featuredLimit > 0 && featuredUsed < featuredLimit,
      canPin: pinnedLimit > 0 && pinnedUsed < pinnedLimit,
      hasPrioritySearch: Boolean(subscription.permissions.prioritySearch),
      hasPriorityHome: Boolean(subscription.permissions.priorityHome),
    };
  }, [subscription]);
}
