import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { promotionPlansFromCatalog } from '@/services/promoteCatalog';

export type PromotionPlanOption = {
  durationDays: number;
  amount: number;
  labelAr: string;
};

export type PromotionTier = {
  key: string;
  weight: number;
  labelAr: string;
  descriptionAr: string;
};

export type PromotionStats = {
  listingId: string;
  isPromoted: boolean;
  tier: string | null;
  impressions: number;
  clicks: number;
  promotedViews: number;
  viewsIncreasePercent: number;
  remainingMs: number;
  expiresAt: string | null;
  startsAt: string | null;
};

/** Fallback promotion plans when the plans API is unreachable — official catalog. */
export const FALLBACK_PROMOTION_PLANS: PromotionPlanOption[] = promotionPlansFromCatalog();

export const PROMOTION_META = {
  icon: 'rocket-outline',
  emoji: '🚀',
  title: 'روّج إعلانك',
  desc: 'زد وصول إعلانك ليظهر في أماكن متعددة داخل التطبيق ويحقق مشاهدات أكثر.',
  accent: 'promotion' as const,
};

export async function fetchPromotionPlans(): Promise<PromotionPlanOption[]> {
  try {
    const res = await fetch(`${API_BASE}/api/listings/promotion/plans`);
    if (!res.ok) return FALLBACK_PROMOTION_PLANS;
    const json = await res.json();
    const plans = json.data?.plans;
    if (!Array.isArray(plans) || plans.length === 0) return FALLBACK_PROMOTION_PLANS;
    return plans as PromotionPlanOption[];
  } catch {
    return FALLBACK_PROMOTION_PLANS;
  }
}

export async function fetchPromotionStats(listingId: string): Promise<PromotionStats | null> {
  const res = await authFetch(`${API_BASE}/api/listings/${listingId}/promotion/stats`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  return json.data as PromotionStats;
}

export async function trackPromotionEvent(
  listingId: string,
  event: 'impression' | 'click' | 'view',
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/listings/${listingId}/promotion/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  } catch {
    // non-blocking analytics
  }
}

export function formatRemainingMs(ms: number): string {
  if (ms <= 0) return 'منتهٍ';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} يوم`;
  if (hours >= 1) return `${hours} ساعة`;
  const minutes = Math.max(1, Math.floor(ms / (1000 * 60)));
  return `${minutes} دقيقة`;
}

export function promotionSuccessMessage(expiresAt?: string): string {
  if (!expiresAt) return 'تم تفعيل ترويج إعلانك بنجاح.';
  try {
    const label = new Date(expiresAt).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `تم تفعيل ترويج إعلانك بنجاح حتى ${label}.`;
  } catch {
    return 'تم تفعيل ترويج إعلانك بنجاح.';
  }
}
