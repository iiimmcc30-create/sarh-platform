import { resolveBootNavigation } from '@/lib/bootRouting';
import { parseActiveMode } from '@/lib/activeMode';
import { interpretOtpVerifyResult } from '@/lib/otpVerifyOutcome';
import {
  resolveAuthBootPhase,
  shouldHideNativeSplash,
} from '@/lib/nativeSplash';
import { listingShareUrl, userShareUrl } from '@/constants/appUrls';
import { handleNotificationNavigation } from '@/lib/notifications';
import { resetNavigationLockForTests, setCurrentPathname } from '@/lib/safeNavigate';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
}));

describe('H6 splash / auth boot sequencing', () => {
  it('keeps splash while fonts or auth bootstrap are pending', () => {
    expect(
      shouldHideNativeSplash({
        fontsReady: true,
        authReady: false,
        onboardingReady: true,
        timedOut: false,
      }),
    ).toBe(false);
  });

  it('hides splash after fonts + session restore + onboarding load', () => {
    expect(
      shouldHideNativeSplash({
        fontsReady: true,
        authReady: true,
        onboardingReady: true,
        timedOut: false,
      }),
    ).toBe(true);
  });

  it('hides splash on fallback timeout even if bootstrap is slow', () => {
    expect(
      shouldHideNativeSplash({
        fontsReady: false,
        authReady: false,
        onboardingReady: false,
        timedOut: true,
      }),
    ).toBe(true);
  });

  it('classifies boot phases without changing auth semantics', () => {
    expect(resolveAuthBootPhase({ isLoading: true, isAuthenticated: false })).toBe(
      'initial_loading',
    );
    expect(
      resolveAuthBootPhase({ isLoading: false, isAuthenticated: true }),
    ).toBe('authenticated');
    expect(
      resolveAuthBootPhase({ isLoading: false, isAuthenticated: false }),
    ).toBe('unauthenticated');
    expect(
      resolveAuthBootPhase({
        isLoading: false,
        isAuthenticated: true,
        refreshKind: 'transient_failure',
      }),
    ).toBe('transient_refresh_failure');
    expect(
      resolveAuthBootPhase({
        isLoading: false,
        isAuthenticated: false,
        refreshKind: 'definitive_failure',
      }),
    ).toBe('definitive_auth_failure');
  });
});

describe('M1 single boot navigation source', () => {
  const base = {
    authLoading: false,
    onboardingLoading: false,
    onboardingComplete: true,
    isAuthenticated: false,
    firstSegment: undefined as string | undefined,
  };

  it('waits during initial loading', () => {
    expect(
      resolveBootNavigation({ ...base, authLoading: true }),
    ).toEqual({ type: 'wait' });
  });

  it('sends first launch / incomplete onboarding to onboarding', () => {
    expect(
      resolveBootNavigation({
        ...base,
        onboardingComplete: false,
        firstSegment: undefined,
      }),
    ).toEqual({ type: 'replace', href: '/onboarding' });
  });

  it('sends onboarding-complete unauthenticated users to welcome', () => {
    expect(resolveBootNavigation(base)).toEqual({
      type: 'replace',
      href: '/auth/welcome',
    });
  });

  it('sends authenticated users on root index to tabs', () => {
    expect(
      resolveBootNavigation({
        ...base,
        isAuthenticated: true,
        firstSegment: 'index',
      }),
    ).toEqual({ type: 'replace', href: '/(tabs)' });
  });

  it('keeps unauthenticated users on register (no mid-flow kick)', () => {
    expect(
      resolveBootNavigation({
        ...base,
        firstSegment: 'auth',
      }),
    ).toEqual({ type: 'stay' });
  });

  it('treats leftover /join URLs as the normal unauthenticated path', () => {
    expect(
      resolveBootNavigation({
        ...base,
        firstSegment: 'join',
      }),
    ).toEqual({ type: 'replace', href: '/auth/welcome' });
  });

  it('does not keep a public butcher join exception before onboarding', () => {
    expect(
      resolveBootNavigation({
        ...base,
        onboardingComplete: false,
        firstSegment: 'join',
      }),
    ).toEqual({ type: 'replace', href: '/onboarding' });
  });

  it('restored session on auth screens goes to the app', () => {
    expect(
      resolveBootNavigation({
        ...base,
        isAuthenticated: true,
        firstSegment: 'auth',
      }),
    ).toEqual({ type: 'replace', href: '/(tabs)' });
  });
});

describe('M2 activeMode persist/restore', () => {
  it('restores BUTCHER', () => {
    expect(parseActiveMode('BUTCHER')).toBe('BUTCHER');
  });

  it('restores USER', () => {
    expect(parseActiveMode('USER')).toBe('USER');
  });

  it('falls back invalid/stale values to USER', () => {
    expect(parseActiveMode('ADMIN')).toBe('USER');
    expect(parseActiveMode(null)).toBe('USER');
    expect(parseActiveMode('')).toBe('USER');
  });
});

describe('M3 register OTP existing phone', () => {
  it('existing phone + OTP → login, not registration', () => {
    expect(
      interpretOtpVerifyResult({ success: true, isNew: false }),
    ).toEqual({ kind: 'existing_login' });
  });

  it('new phone + OTP → registration continuation with phoneToken', () => {
    expect(
      interpretOtpVerifyResult({
        success: true,
        isNew: true,
        phoneToken: 'tok',
      }),
    ).toEqual({ kind: 'registration_continuation', phoneToken: 'tok' });
  });

  it('invalid OTP stays an error', () => {
    expect(
      interpretOtpVerifyResult({ success: false, error: 'الرمز غير صحيح' }),
    ).toEqual({ kind: 'invalid', error: 'الرمز غير صحيح' });
  });

  it('expired OTP stays an error', () => {
    expect(
      interpretOtpVerifyResult({ success: false, error: 'انتهت صلاحية الرمز' }).kind,
    ).toBe('invalid');
  });

  it('missing phoneToken only when registration genuinely requires it', () => {
    expect(
      interpretOtpVerifyResult({ success: true, isNew: true }),
    ).toMatchObject({ kind: 'missing_phone_token' });
    expect(
      interpretOtpVerifyResult({ success: true, isNew: false }).kind,
    ).toBe('existing_login');
  });
});

describe('M4 share domain', () => {
  it('builds listing share URLs on the canonical origin', () => {
    expect(listingShareUrl('abc-123')).toBe('https://sarhsa.online/l/abc-123');
  });

  it('builds user share URLs on the same origin', () => {
    expect(userShareUrl('salem')).toBe('https://sarhsa.online/u/salem');
  });
});

describe('M8 follow notification deep link', () => {
  function router() {
    return { push: jest.fn(), replace: jest.fn() };
  }

  beforeEach(() => {
    setCurrentPathname('/notifications');
    resetNavigationLockForTests();
  });

  it('opens the actor profile when actor id is present', () => {
    const r = router();
    handleNotificationNavigation(
      { type: 'follow', data: { actorId: 'user-42' } },
      { router: r as never, isAdmin: false },
    );
    expect(r.push).toHaveBeenCalled();
    const arg = r.push.mock.calls[0][0];
    expect(arg).toEqual({ pathname: '/users/[id]', params: { id: 'user-42' } });
  });

  it('falls back to notifications when actor id is missing', () => {
    setCurrentPathname('/(tabs)');
    resetNavigationLockForTests();
    const r = router();
    handleNotificationNavigation(
      { type: 'follow', data: {} },
      { router: r as never, isAdmin: false },
    );
    expect(r.push).toHaveBeenCalledWith('/notifications');
  });

  it('keeps message notifications on the chat/messages path', () => {
    const r = router();
    handleNotificationNavigation(
      { type: 'new_message', data: { threadId: 't1', senderId: 'u2' } },
      { router: r as never, isAdmin: false },
    );
    const arg = r.push.mock.calls[0][0];
    expect(arg.pathname).toBe('/chat');
    expect(arg.params.threadId).toBe('t1');
  });

  it('leaves other notification types unchanged', () => {
    const r = router();
    handleNotificationNavigation(
      { type: 'like', data: { postId: 'p1' } },
      { router: r as never, isAdmin: false },
    );
    expect(JSON.stringify(r.push.mock.calls[0][0])).toContain('p1');
  });
});
