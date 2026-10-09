// Store-build policy for DIGITAL purchases (App Store 3.1.1 / Google Play Payments).
//
// Digital services — verification subscriptions (Blue / Blue+ / Gold), listing
// boosts (featured / pin / both) and visibility promotion — are sold in the
// native apps ONLY through Apple In-App Purchase / Google Play Billing
// (services/iap.ts, product IDs in lib/storeProducts.ts). The website keeps
// N-Genius for everything. Physical-goods payments — the livestock-sale
// commission and listing fees — stay on N-Genius everywhere.
//
// EXPO_PUBLIC_STORE_DIGITAL_PURCHASES is now an EMERGENCY KILL SWITCH: unset or
// 'true' → digital services visible (bought with IAP); 'false' → every entry
// point hidden («غير متاحة حالياً»), e.g. if store review or billing breaks.
// Build-time env (EAS profile `env`, inlined by Expo — keep the literal names):
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES          shared switch for iOS + Android ('true' | 'false')
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS      iOS override
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_ANDROID  Android override
// The website (Platform.OS === 'web') is not a store build and is never hidden.
import { Platform } from 'react-native';

export const DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR = 'غير متاحة حالياً';
export const DIGITAL_PURCHASES_UNAVAILABLE_BODY_AR =
  'هذه الخدمة غير متاحة في هذا الإصدار من التطبيق.';

export type DigitalPurchasesEnv = {
  shared?: string;
  ios?: string;
  android?: string;
};

function parseFlag(value: string | undefined): boolean | undefined {
  const v = value?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return undefined;
}

/** Pure resolver (unit-tested). Default ON: the switch only turns purchases off. */
export function resolveDigitalPurchasesEnabled(os: string, env: DigitalPurchasesEnv): boolean {
  if (os === 'ios') return parseFlag(env.ios) ?? parseFlag(env.shared) ?? true;
  if (os === 'android') return parseFlag(env.android) ?? parseFlag(env.shared) ?? true;
  return true;
}

/**
 * True on the native store apps: digital services are paid with Apple IAP /
 * Google Play Billing and never with the external gateway (no steering).
 */
export function usesStoreBilling(os: string = Platform.OS): boolean {
  return os === 'ios' || os === 'android';
}

/** Payment contexts that are digital services (store billing on native). */
export function isDigitalPaymentContext(context: string | undefined): boolean {
  return context === 'subscription' || context === 'boost' || context === 'promotion';
}

export const STORE_BILLING_ONLY_TITLE_AR = 'الشراء داخل التطبيق';
export const STORE_BILLING_ONLY_BODY_AR =
  'تُشترى هذه الخدمة في التطبيق عبر المتجر فقط.';

export function readDigitalPurchasesEnv(): DigitalPurchasesEnv {
  return {
    shared: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES,
    ios: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS,
    android: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_ANDROID,
  };
}

/** True when this build may show subscriptions, verification plans and boosts (kill switch). */
export function digitalPurchasesEnabled(): boolean {
  return resolveDigitalPurchasesEnabled(Platform.OS, readDigitalPurchasesEnv());
}

/** In-app routes that sell digital goods (also reached via deep links / notifications). */
export const DIGITAL_PURCHASE_ROUTES = [
  '/subscription',
  '/verification',
  '/promote',
  '/listing/[id]/promote',
] as const;

/** True for a pathname that opens a digital-purchase screen. */
export function isDigitalPurchaseRoute(pathname: string): boolean {
  const path = (pathname.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  return (
    path === '/subscription' ||
    path === '/verification' ||
    path === '/promote' ||
    /^\/listing\/[^/]+\/promote$/.test(path)
  );
}

/** Drops menu rows that open a digital-purchase screen, then any group left empty. */
export function withoutDigitalPurchaseRows<
  R extends { route?: string },
  G extends { rows: R[] },
>(groups: G[], allowed: boolean = digitalPurchasesEnabled()): G[] {
  if (allowed) return groups;
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !r.route || !isDigitalPurchaseRoute(r.route)) }))
    .filter((g) => g.rows.length > 0);
}
