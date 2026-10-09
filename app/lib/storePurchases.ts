// Store-build policy for DIGITAL purchases (App Store 3.1.1 / Google Play Payments).
//
// Digital goods sold through the external gateway (N-Genius): subscriptions
// (Blue / Blue+ / Gold verification plans, free trial), listing boosts
// (featured / pin / promotion) and their paywall CTAs. Store builds hide every
// entry point unless the build explicitly opts in. Physical-goods payments —
// the livestock-sale commission and listing fees — are NOT affected.
//
// Build-time env (EAS profile `env`, inlined by Expo — keep the literal names):
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES          shared default for iOS + Android ('true' | 'false')
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS      iOS override
//   EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_ANDROID  Android override
// Unset → hidden on iOS and Android. The website (Platform.OS === 'web') is not a
// store build and always keeps the purchase flows.
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

/** Pure resolver (unit-tested). */
export function resolveDigitalPurchasesEnabled(os: string, env: DigitalPurchasesEnv): boolean {
  if (os === 'ios') return parseFlag(env.ios) ?? parseFlag(env.shared) ?? false;
  if (os === 'android') return parseFlag(env.android) ?? parseFlag(env.shared) ?? false;
  return true;
}

export function readDigitalPurchasesEnv(): DigitalPurchasesEnv {
  return {
    shared: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES,
    ios: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS,
    android: process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_ANDROID,
  };
}

/** True when this build may show subscriptions, verification plans and boosts. */
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
