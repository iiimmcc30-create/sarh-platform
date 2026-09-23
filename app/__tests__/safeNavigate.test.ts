import {
  normalizeRoutePath,
  pathsMatch,
  isNavigationLocked,
  isAlreadyOnRoute,
  setCurrentPathname,
  safePush,
  closeThen,
  resetNavigationLockForTests,
} from '@/lib/safeNavigate';

describe('safeNavigate', () => {
  beforeEach(() => {
    setCurrentPathname('/');
    resetNavigationLockForTests();
  });

  it('normalizes expo group routes', () => {
    expect(normalizeRoutePath('/(tabs)/profile')).toBe('/profile');
    expect(normalizeRoutePath('/(tabs)/profile/')).toBe('/profile');
    expect(normalizeRoutePath('/profile/settings?x=1')).toBe('/profile/settings');
    expect(normalizeRoutePath('/butchers/index')).toBe('/butchers');
    expect(normalizeRoutePath('/butchers/index/')).toBe('/butchers');
  });

  it('matches equivalent paths', () => {
    expect(pathsMatch('/(tabs)/profile', '/profile')).toBe(true);
    expect(pathsMatch('/market', '/posts')).toBe(false);
  });

  it('detects already-on-route', () => {
    setCurrentPathname('/(tabs)/profile');
    expect(isAlreadyOnRoute('/(tabs)/profile')).toBe(true);
    expect(isAlreadyOnRoute('/profile')).toBe(true);
    expect(isAlreadyOnRoute('/settings')).toBe(false);
  });

  it('locks duplicate pushes', () => {
    const pushes: unknown[] = [];
    const router = {
      push: (href: unknown) => {
        pushes.push(href);
      },
      back: () => {},
    };

    setCurrentPathname('/(tabs)');
    expect(safePush('/(tabs)/profile', undefined, router)).toBe(true);
    expect(isNavigationLocked()).toBe(true);
    expect(safePush('/(tabs)/profile', undefined, router)).toBe(false);
    expect(safePush('/favorites', undefined, router)).toBe(false);
    expect(pushes).toHaveLength(1);
  });

  it('skips push when already on destination', () => {
    const pushes: unknown[] = [];
    const router = {
      push: (href: unknown) => {
        pushes.push(href);
      },
      back: () => {},
    };
    setCurrentPathname('/(tabs)/profile');
    resetNavigationLockForTests();
    expect(safePush('/(tabs)/profile', undefined, router)).toBe(false);
    expect(pushes).toHaveLength(0);
  });

  it('closes first then runs the follow-up after the lock clears', () => {
    jest.useFakeTimers();
    const backs: number[] = [];
    let ran = false;
    const router = {
      push: () => {},
      back: () => {
        backs.push(1);
      },
    };

    expect(closeThen(() => {
      ran = true;
    }, { closeDelayMs: 120 }, router)).toBe(true);
    expect(backs).toHaveLength(1);
    expect(ran).toBe(false);
    expect(isNavigationLocked()).toBe(true);

    jest.advanceTimersByTime(120);
    expect(ran).toBe(true);
    expect(isNavigationLocked()).toBe(false);
    jest.useRealTimers();
  });
});
