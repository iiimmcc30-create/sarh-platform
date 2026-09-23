/**
 * Central navigation guard for Sarh.
 *
 * Prevents:
 * - Double-tap pushing the same screen twice
 * - Rapid re-entry while a transition is in flight
 * - No-op pushes when already on the destination
 *
 * This is NOT a debounce of the press UI — buttons stay responsive;
 * only duplicate/in-flight route changes are ignored.
 */
import { router as expoRouter, type Href } from 'expo-router';

type RouterLike = {
  push: (href: any) => void;
  replace?: (href: any) => void;
  back: () => void;
  canGoBack?: () => boolean;
};

type NavigateOptions = {
  /** Bypass lock (auth redirects, forced recovery). */
  force?: boolean;
  /** Close current modal/sidebar before pushing. */
  closeFirst?: boolean;
  /** Delay after close before push (ms). */
  closeDelayMs?: number;
};

const DEFAULT_LOCK_MS = 550;
const CLOSE_THEN_PUSH_DELAY_MS = 120;

let lockedUntil = 0;
let unlockTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightHref: string | null = null;
let currentPathname = '/';

export function setCurrentPathname(pathname: string | null | undefined): void {
  if (typeof pathname === 'string' && pathname.length > 0) {
    currentPathname = pathname;
  }
}

export function getCurrentPathname(): string {
  return currentPathname;
}

/** Normalize Expo routes for comparison: strip groups, queries, trailing slash. */
export function normalizeRoutePath(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '/';

  const withoutQuery = raw.split('?')[0]?.split('#')[0] ?? raw;
  const withoutGroups = withoutQuery.replace(/\/\([^/]+\)/g, '');
  const collapsed = withoutGroups.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.replace(/\/$/, '');
  const withoutIndex = trimmed.replace(/\/index$/i, '');
  return withoutIndex.length > 0 ? withoutIndex : '/';
}

function hrefToPath(href: string | Href | Record<string, unknown>): string {
  if (typeof href === 'string') return normalizeRoutePath(href);
  if (href && typeof href === 'object') {
    const obj = href as { pathname?: string; params?: Record<string, unknown> };
    if (typeof obj.pathname === 'string') {
      let path = obj.pathname;
      if (obj.params && typeof obj.params === 'object') {
        for (const [key, value] of Object.entries(obj.params)) {
          if (value == null) continue;
          path = path.replace(`[${key}]`, encodeURIComponent(String(value)));
        }
      }
      return normalizeRoutePath(path);
    }
  }
  return normalizeRoutePath(String(href));
}

export function isNavigationLocked(): boolean {
  return Date.now() < lockedUntil;
}

export function pathsMatch(a: string, b: string): boolean {
  return normalizeRoutePath(a) === normalizeRoutePath(b);
}

function clearUnlockTimer(): void {
  if (unlockTimer) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
  }
}

function armLock(hrefKey: string, ms = DEFAULT_LOCK_MS): void {
  lockedUntil = Date.now() + ms;
  inFlightHref = hrefKey;
  clearUnlockTimer();
  unlockTimer = setTimeout(() => {
    lockedUntil = 0;
    inFlightHref = null;
    unlockTimer = null;
  }, ms);
}

function releaseLockSoon(ms = 280): void {
  armLock(inFlightHref ?? '__release__', ms);
}

/**
 * Acquire the navigation lock. Returns false if another transition is active.
 */
export function beginNavigation(href: string | Href | Record<string, unknown>, force = false): boolean {
  const key = hrefToPath(href);
  if (!force && isNavigationLocked()) {
    return false;
  }
  armLock(key);
  return true;
}

/** Test-only helper to clear the in-flight lock. */
export function resetNavigationLockForTests(): void {
  clearUnlockTimer();
  lockedUntil = 0;
  inFlightHref = null;
}

export function isAlreadyOnRoute(href: string | Href | Record<string, unknown>): boolean {
  return pathsMatch(currentPathname, hrefToPath(href));
}

/**
 * Safe stack push. Returns true if navigation was started.
 */
export function safePush(
  href: string | Href | Record<string, unknown>,
  options?: NavigateOptions,
  routerRef: RouterLike = expoRouter as unknown as RouterLike,
): boolean {
  const key = hrefToPath(href);

  if (!options?.force) {
    if (isNavigationLocked()) return false;
    if (isAlreadyOnRoute(href)) return false;
  }

  if (options?.closeFirst) {
    return closeThenPush(href, options, routerRef);
  }

  if (!beginNavigation(href, options?.force)) return false;

  try {
    routerRef.push(href as never);
    return true;
  } catch {
    releaseLockSoon(200);
    return false;
  }
}

/**
 * Safe replace (auth / recovery). Prefer force for AuthGuard.
 */
export function safeReplace(
  href: string | Href | Record<string, unknown>,
  options?: NavigateOptions,
  routerRef: RouterLike = expoRouter as unknown as RouterLike,
): boolean {
  if (!options?.force) {
    if (isNavigationLocked()) return false;
    if (isAlreadyOnRoute(href)) return false;
  }

  if (!beginNavigation(href, options?.force)) return false;

  try {
    if (typeof routerRef.replace === 'function') {
      routerRef.replace(href as never);
    } else {
      routerRef.push(href as never);
    }
    return true;
  } catch {
    releaseLockSoon(200);
    return false;
  }
}

/**
 * Close the current modal/sidebar, then run `next` after the close delay.
 * Clears the nav lock before `next` so a follow-up push can start.
 */
export function closeThen(
  next: () => void,
  options?: NavigateOptions,
  routerRef: RouterLike = expoRouter as unknown as RouterLike,
): boolean {
  const delay = options?.closeDelayMs ?? CLOSE_THEN_PUSH_DELAY_MS;
  if (!options?.force && isNavigationLocked()) return false;
  if (!beginNavigation('__close_then__', options?.force)) return false;

  try {
    routerRef.back();
  } catch {
    // If nothing to close, continue.
  }

  setTimeout(() => {
    clearUnlockTimer();
    lockedUntil = 0;
    inFlightHref = null;
    next();
  }, delay);

  return true;
}

/**
 * Close modal/sidebar then push — used by all sidebars.
 * If already on destination, only closes (no duplicate push).
 */
export function closeThenPush(
  href: string | Href | Record<string, unknown>,
  options?: NavigateOptions,
  routerRef: RouterLike = expoRouter as unknown as RouterLike,
): boolean {
  const delay = options?.closeDelayMs ?? CLOSE_THEN_PUSH_DELAY_MS;
  const alreadyThere = !options?.force && isAlreadyOnRoute(href);

  if (!options?.force && isNavigationLocked()) return false;
  if (!beginNavigation(href, options?.force)) return false;

  try {
    routerRef.back();
  } catch {
    // If nothing to close, continue to push.
  }

  if (alreadyThere) {
    releaseLockSoon(320);
    return true;
  }

  setTimeout(() => {
    try {
      routerRef.push(href as never);
      // Keep lock through the push transition.
      armLock(hrefToPath(href), DEFAULT_LOCK_MS);
    } catch {
      releaseLockSoon(200);
    }
  }, delay);

  return true;
}

/** Tab / React Navigation navigate with the same lock semantics. */
export function safeNavigateTab(
  navigate: (routeName: string) => void,
  routeName: string,
  isFocused: boolean,
): boolean {
  if (isFocused) return false;
  if (isNavigationLocked()) return false;
  if (!beginNavigation(`/(tabs)/${routeName}`)) return false;
  navigate(routeName);
  return true;
}
