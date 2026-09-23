

import {
  createContext,
  ReactNode,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  EMPTY_PLAN,
  mapApiPlan,
  normalizeSlug,
  type PlanPermissions,
  type SubscriptionPlan,
} from '@/services/subscriptionPlans';
import { useAuth } from './AuthContext';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

interface SubscriptionState {
  id: string | null;
  planSlug: string;
  planAudience: 'USER' | 'BUTCHER';
  plan: SubscriptionPlan;
  renewDate: string;
  permissions: PlanPermissions;
  usageCounters: {
    listingsUsed: number;
    liveMinutesUsed: number;
    featuredAdsUsed: number;
    pinnedAdsUsed: number;
    dailyAdsUsed: number;
  };
  loading: boolean;
}

interface SubscriptionContextValue {
  subscription: SubscriptionState;
  upgradePlan: (planSlug: string) => void;
  refetchSubscription: () => Promise<void>;
}

const defaultState: SubscriptionState = {
  id: null,
  planSlug: 'free',
  planAudience: 'USER',
  plan: EMPTY_PLAN,
  renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  permissions: {},
  usageCounters: {
    listingsUsed: 0,
    liveMinutesUsed: 0,
    featuredAdsUsed: 0,
    pinnedAdsUsed: 0,
    dailyAdsUsed: 0,
  },
  loading: true,
};

const PLAN_CATALOG_TTL_MS = 5 * 60_000;
const planCatalogCache = new Map<string, { plans: SubscriptionPlan[]; fetchedAt: number }>();

async function fetchPlanCatalog(audience: 'USER' | 'BUTCHER'): Promise<SubscriptionPlan[]> {
  const now = Date.now();
  const cached = planCatalogCache.get(audience);
  if (cached && now - cached.fetchedAt < PLAN_CATALOG_TTL_MS) {
    return cached.plans;
  }
  const plansRes = await fetch(`${API_BASE}/api/plans?audience=${audience}`);
  if (!plansRes.ok) return cached?.plans ?? [];
  const plansJson = await plansRes.json();
  if (!plansJson.success || !Array.isArray(plansJson.data?.plans)) {
    return cached?.plans ?? [];
  }
  const plans = plansJson.data.plans.map((p: Record<string, unknown>) => mapApiPlan(p));
  planCatalogCache.set(audience, { plans, fetchedAt: now });
  return plans;
}

export const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [subscription, setSubscription] =
    useState<SubscriptionState>(defaultState);

  const fetchSubscription = useCallback(async () => {
    if (!isAuthenticated || !accessToken) {
      setSubscription((prev) => ({ ...prev, loading: false }));
      return;
    }
    try {
      const audienceRes = await authFetch(`${API_BASE}/api/subscriptions`);
      const subRes = audienceRes;

      if (subRes.ok) {
        const json = await subRes.json();
        if (json.success && json.data) {
          const data = json.data;
          const planAudience = (data.planAudience ?? 'USER') as 'USER' | 'BUTCHER';
          const planSlug = normalizeSlug(data.effectivePlanSlug ?? data.planId ?? 'free');

          const planCatalog = await fetchPlanCatalog(planAudience);

          const apiPlan = data.plan
            ? mapApiPlan(data.plan as Record<string, unknown>)
            : undefined;
          const catalogPlan = planCatalog.find(
            (p) => p.slug === planSlug && p.audience === planAudience,
          );
          const plan = apiPlan ?? catalogPlan ?? { ...EMPTY_PLAN, slug: planSlug, audience: planAudience };

          setSubscription({
            id: data.id ?? null,
            planSlug,
            planAudience,
            plan,
            renewDate: data.renewDate || defaultState.renewDate,
            permissions: data.permissions ?? plan.permissions ?? {},
            usageCounters: data.usageCounters ?? {
              listingsUsed: data.listingsUsed ?? 0,
              liveMinutesUsed: data.liveMinutesUsed ?? 0,
              featuredAdsUsed: data.featuredAdsUsed ?? 0,
              pinnedAdsUsed: data.pinnedAdsUsed ?? 0,
              dailyAdsUsed: data.dailyAdsUsed ?? 0,
            },
            loading: false,
          });
          return;
        }
      }
    } catch (err) {
      console.warn('[SubscriptionContext] Failed to fetch subscription:', err);
    }
    setSubscription((prev) => ({ ...prev, loading: false }));
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const upgradePlan = useCallback((_planSlug: string) => {
    void fetchSubscription();
  }, [fetchSubscription]);

  const subscriptionValue = useMemo(
    () => ({
      subscription,
      upgradePlan,
      refetchSubscription: fetchSubscription,
    }),
    [subscription, upgradePlan, fetchSubscription],
  );

  return (
    <SubscriptionContext.Provider value={subscriptionValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
}
