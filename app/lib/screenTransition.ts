import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/** Open a pushed screen — fast, no spring. */
export const FADE_SCALE_OPEN_MS = 200;
/** Reverse on back — same family, slightly snappier. */
export const FADE_SCALE_BACK_MS = 200;
export const FADE_SCALE_FROM = 0.96;

/**
 * Routes that keep their own presentation (tabs, sheets, auth, stories).
 * Not a slide — they either stay put or use fade / bottom sheet.
 */
export const FADE_SCALE_SKIP_ROUTES = new Set<string>([
  '(tabs)',
  'index',
  'sidebar',
  'payment/checkout',
  'support/index',
  'support/help',
  'stories/view',
  'onboarding/index',
  'auth/welcome',
  'auth/phone',
  'auth/otp',
  'auth/register',
  'auth/forgot-password',
  'expo-auth-session',
]);

export function shouldSkipFadeScale(routeName: string): boolean {
  return FADE_SCALE_SKIP_ROUTES.has(routeName);
}

export function isImmediateNavAction(type: string): boolean {
  return type === 'REPLACE' || type === 'RESET';
}

/**
 * Native stack: no translateX. Previous screen stays mounted underneath.
 * JS FadeScaleAppear owns opacity + scale timing (Android + iOS).
 */
export function fadeScaleStackScreenOptions(
  extras: NativeStackNavigationOptions = {},
): NativeStackNavigationOptions {
  return {
    animation: 'none',
    presentation: 'transparentModal',
    ...extras,
    contentStyle: {
      backgroundColor: 'transparent',
      ...(extras.contentStyle as object | undefined),
    },
  };
}
