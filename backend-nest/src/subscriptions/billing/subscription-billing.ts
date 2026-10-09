import { isPaidPlan, isTrialRow } from '../../lib/subscription-lifecycle';

/**
 * Where the current verification period is billed:
 * - app_store / google_play: an active store auto-renewable subscription
 *   (managed and cancelled in the store, never through our cancel endpoint);
 * - ngenius: the website checkout (manual renewal, cancel = stop reminders);
 * - trial: the one-week free Blue+ trial (no billing at all);
 * - none: free plan.
 */
export type BillingSource =
  'app_store' | 'google_play' | 'ngenius' | 'trial' | 'none';

export type ActiveStoreSubscription = {
  platform: 'app_store' | 'google_play';
  autoRenew: boolean | null;
  expiresAt: Date | null;
};

export type BillingInfo = {
  source: BillingSource;
  /** True when the period renews (store auto-renew, or web renewal intent). */
  autoRenew: boolean;
  /** End of the current paid / trial period (null on the free plan). */
  expiresAt: Date | null;
};

export function resolveBilling(params: {
  subscription: {
    planId: string;
    renewDate: Date;
    autoRenew: boolean;
    status?: string | null;
  } | null;
  store: ActiveStoreSubscription | null;
}): BillingInfo {
  const { subscription, store } = params;
  if (store) {
    return {
      source: store.platform,
      autoRenew: store.autoRenew ?? subscription?.autoRenew ?? true,
      expiresAt: store.expiresAt ?? subscription?.renewDate ?? null,
    };
  }
  if (!subscription || !isPaidPlan(subscription.planId)) {
    return { source: 'none', autoRenew: false, expiresAt: null };
  }
  if (isTrialRow(subscription)) {
    return {
      source: 'trial',
      autoRenew: false,
      expiresAt: subscription.renewDate,
    };
  }
  return {
    source: 'ngenius',
    autoRenew: subscription.autoRenew,
    expiresAt: subscription.renewDate,
  };
}

export function isStoreBilling(source: BillingSource): boolean {
  return source === 'app_store' || source === 'google_play';
}

export const MANAGE_IN_STORE_MESSAGE_AR: Record<
  'app_store' | 'google_play',
  string
> = {
  app_store:
    'اشتراكك عبر App Store، ويُلغى من إعدادات الاشتراكات في حساب Apple الخاص بك.',
  google_play:
    'اشتراكك عبر Google Play، ويُلغى من قسم الاشتراكات في متجر Google Play.',
};
