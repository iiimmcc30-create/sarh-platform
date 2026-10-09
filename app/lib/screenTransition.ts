import { Platform } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { isAppRtl } from '@/lib/rtl';

/*
 * Navigation motion — modern iOS feel on iOS and Android.
 *
 *   push     — native stack push. iOS: UINavigationController (parallax, edge swipe-back,
 *              mirrored automatically under RTL). Android: rn-screens' iOS-like slide,
 *              mirrored for RTL (Arabic pushes in from the left).
 *   composer — full-screen cover that slides up (create post / listing / story).
 *   sheets   — JS sheets (sidebar, support) keep their own transparent presentation.
 */

/** Fullscreen media viewer (lib/mediaOrigin) — expands from its origin, not a page push. */
export const FADE_SCALE_OPEN_MS = 200;
export const FADE_SCALE_BACK_MS = 200;
export const FADE_SCALE_FROM = 0.96;

type StackAnimation = NonNullable<NativeStackNavigationOptions['animation']>;

/** Native push animation for the platform / layout direction. */
export function iosPushAnimation(
  platform: string = Platform.OS,
  rtl: boolean = isAppRtl(),
): StackAnimation {
  if (platform === 'android') return rtl ? 'ios_from_left' : 'ios_from_right';
  // iOS: the system push (also follows the RTL direction). Web ignores it.
  return 'default';
}

/** Default options for every stack: native push + swipe-back. Callers may override. */
export function iosStackScreenOptions(
  extras: NativeStackNavigationOptions = {},
  platform: string = Platform.OS,
  rtl: boolean = isAppRtl(),
): NativeStackNavigationOptions {
  return {
    animation: iosPushAnimation(platform, rtl),
    presentation: 'card',
    gestureEnabled: true,
    gestureDirection: 'horizontal',
    ...extras,
  };
}

/** Composer screens: full-screen cover sliding up (no swipe dismiss — drafts stay safe). */
export function composerModalOptions(): NativeStackNavigationOptions {
  return {
    presentation: 'fullScreenModal',
    animation: 'slide_from_bottom',
    gestureEnabled: false,
  };
}

/**
 * Routes that paint their own background (tab shell, transparent sheets, full-screen
 * media). Every other screen gets an opaque patterned page so the push slides a solid page.
 */
export const OWN_BACKGROUND_ROUTES = new Set<string>([
  '(tabs)',
  'sidebar',
  'support/help',
  'stories/view',
  'expo-auth-session',
]);

export function screenHasOwnBackground(routeName: string): boolean {
  return OWN_BACKGROUND_ROUTES.has(routeName);
}
