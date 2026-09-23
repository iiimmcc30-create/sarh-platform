import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/services/api';
import {
  EMPTY_PLAN,
  mapApiPlan,
  normalizeSlug,
  type PlanAudience,
  type SubscriptionPlan,
} from '@/services/subscriptionPlans';

export function usePlans(audience: PlanAudience = 'USER') {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([EMPTY_PLAN]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plans?audience=${audience}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.plans)) {
          const mapped = json.data.plans.map((p: Record<string, unknown>) =>
            mapApiPlan(p),
          );
          if (mapped.length > 0) setPlans(mapped);
        }
      }
    } catch {
      // keep last known plans
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const getPlanBySlug = useCallback(
    (slug: string) => {
      const normalized = normalizeSlug(slug);
      const found = plans.find((p) => p.slug === normalized);
      if (found) return found;
      // Never fall back to a paid plan when looking up "free" (or any missing slug).
      // That was showing free users the paid plan price/features with a "مجاني" label.
      if (normalized === 'free') return EMPTY_PLAN;
      return EMPTY_PLAN;
    },
    [plans],
  );

  return { plans, loading, getPlanBySlug, refetch: fetchPlans };
}
