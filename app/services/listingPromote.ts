import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import {
  lookupPromoteCatalogOption,
  PROMOTE_CATALOG_AMOUNT_MIN,
} from '@/services/promoteCatalog';

export type PromotionGoal = 'visibility' | 'pinned' | 'featured';

export const PROMOTE_AMOUNT_MIN = PROMOTE_CATALOG_AMOUNT_MIN;
export const PROMOTE_AMOUNT_MAX = 500;
export const PROMOTE_AMOUNT_DEFAULT = 19;

export const PROMOTE_DURATION_HOURS_MIN = 1;
export const PROMOTE_DURATION_HOURS_MAX = 168;
export const PROMOTE_DURATION_HOURS_DEFAULT = 24;

export type PromoteGoalOption = {
  key: PromotionGoal;
  icon: string;
  title: string;
  desc: string;
  accent: 'electric' | 'gold' | 'promotion';
};

export const PROMOTE_GOAL_OPTIONS: PromoteGoalOption[] = [
  {
    key: 'visibility',
    icon: 'rocket-outline',
    title: 'زيادة ظهور إعلانك',
    desc: 'زيادة قوة الظهور في الخوارزمية — بدون أي تغيير على شكل الإعلان',
    accent: 'promotion',
  },
  {
    key: 'pinned',
    icon: 'pin',
    title: 'تثبيت إعلانك في أعلى القائمة',
    desc: 'دبوس صغير بجانب العنوان — يبقى الإعلان في أعلى القائمة',
    accent: 'electric',
  },
  {
    key: 'featured',
    icon: 'star',
    title: 'شارة مميزة في نتائج البحث',
    desc: 'نجمة ذهبية صغيرة بجانب عنوان الإعلان في نتائج البحث',
    accent: 'gold',
  },
];

export type ReachEstimate = { min: number; max: number };

export type PromoteQuote = {
  goal: PromotionGoal;
  durationHours: number;
  amount: number;
  minimumAmount: number;
  currency: 'SAR';
  reachEstimate?: ReachEstimate;
  pricingMode: 'catalog' | 'duration_based';
};

export type PromoteCheckoutPayload = {
  promotionGoal: PromotionGoal;
  promotionAmount: number;
  promotionDurationHours: number;
  totalAmount: number;
  adId: string;
  startTime: string;
  endTime: string;
  reachEstimate?: ReachEstimate;
};

/** Display preview only — server catalog is authoritative for charge. */
export function computeBoostPrice(goal: 'pinned' | 'featured', durationHours: number): number {
  return lookupPromoteCatalogOption(goal, { durationHours })?.amount ?? 0;
}

/** Display preview only — catalog amount for a visibility duration. */
export function computeVisibilityMinPrice(durationHours: number): number {
  return lookupPromoteCatalogOption('visibility', { durationHours })?.amount ?? 0;
}

/** Estimated reach range for visibility promotion. */
export function estimatePromotionReach(amount: number, durationHours: number): ReachEstimate {
  const budget = Math.min(PROMOTE_AMOUNT_MAX, Math.max(PROMOTE_AMOUNT_MIN, Math.round(amount)));
  const hours = clampPromoteDurationHours(durationHours);
  const min = Math.max(50, Math.round(budget * 9 + hours * 3));
  const max = Math.max(min + 30, Math.round(budget * 15 + hours * 5));
  return { min, max };
}

export function resolvePromoteAmount(
  goal: PromotionGoal,
  durationHours: number,
  _userBudget?: number,
): number {
  return lookupPromoteCatalogOption(goal, { durationHours })?.amount ?? 0;
}

export function clampPromoteAmount(value: number): number {
  return Math.min(PROMOTE_AMOUNT_MAX, Math.max(PROMOTE_AMOUNT_MIN, Math.round(value)));
}

export function clampPromoteDurationHours(value: number): number {
  return Math.min(
    PROMOTE_DURATION_HOURS_MAX,
    Math.max(PROMOTE_DURATION_HOURS_MIN, Math.round(value)),
  );
}

export function parsePromoteAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return clampPromoteAmount(n);
}

export function parsePromoteDurationInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return clampPromoteDurationHours(n);
}

export function buildPromoteCheckoutPayload(
  adId: string,
  promotionGoal: PromotionGoal,
  promotionDurationHours: number,
  _ignoredAmount?: number,
): PromoteCheckoutPayload | null {
  const option = lookupPromoteCatalogOption(promotionGoal, {
    durationHours: promotionDurationHours,
  });
  if (!option) return null;
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + option.durationHours * 60 * 60 * 1000);
  const reachEstimate =
    promotionGoal === 'visibility'
      ? estimatePromotionReach(option.amount, option.durationHours)
      : undefined;
  return {
    promotionGoal,
    promotionAmount: option.amount,
    promotionDurationHours: option.durationHours,
    totalAmount: option.amount,
    adId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    reachEstimate,
  };
}

export function validatePromoteForm(
  goal: PromotionGoal | null,
  _amount: number,
  durationHours: number,
): string | null {
  if (!goal) return 'اختر هدف الترويج';
  const option = lookupPromoteCatalogOption(goal, { durationHours });
  if (!option) return 'اختر مدة صالحة من الكتالوج';
  return null;
}

export function goalFromBoostType(type?: string | null): PromotionGoal | null {
  if (type === 'promotion' || type === 'visibility') return 'visibility';
  if (type === 'pinned' || type === 'featured') return type;
  return null;
}

export type InitiatePromotePaymentResult = {
  paymentId: string;
  checkoutUrl?: string;
  devMode?: boolean;
  amount: number;
  promotionId?: string;
  boostId?: string;
};

export async function fetchPromoteQuote(
  goal: PromotionGoal,
  durationHours: number,
): Promise<PromoteQuote> {
  const params = new URLSearchParams({
    goal,
    durationHours: String(durationHours),
  });
  const res = await fetch(`${API_BASE}/api/listings/promote/quote?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr ?? json.message ?? 'تعذّر حساب السعر');
  }
  return json.data as PromoteQuote;
}

export async function initiatePromotePayment(
  accessToken: string,
  payload: PromoteCheckoutPayload,
  method = 'mada',
): Promise<InitiatePromotePaymentResult> {
  const isBoost = payload.promotionGoal === 'pinned' || payload.promotionGoal === 'featured';

  const body: Record<string, unknown> = {
    method,
    durationHours: payload.promotionDurationHours,
    promotionGoal: payload.promotionGoal,
  };

  const endpoint = isBoost
    ? `${API_BASE}/api/listings/${payload.adId}/boost`
    : `${API_BASE}/api/listings/${payload.adId}/promotion`;

  const boostBody = isBoost
    ? { ...body, boostType: payload.promotionGoal }
    : body;

  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(boostBody),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr ?? json.message ?? 'تعذّر بدء عملية الدفع');
  }

  const data = json.data ?? {};
  return {
    paymentId: data.paymentId,
    checkoutUrl: data.checkoutUrl,
    devMode: data.devMode,
    amount: data.amount ?? payload.totalAmount,
    promotionId: data.promotionId,
    boostId: data.boostId,
  };
}

export function formatPromoteHours(hours: number): string {
  return `${hours.toLocaleString('ar-SA')} ساعة`;
}

export function formatPromoteAmount(amount: number): string {
  return `${amount.toLocaleString('ar-SA')} ريال`;
}

export function formatReachEstimate(reach: ReachEstimate): string {
  return `${reach.min.toLocaleString('ar-SA')}–${reach.max.toLocaleString('ar-SA')} مشاهدة`;
}
