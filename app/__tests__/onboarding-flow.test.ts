/**
 * Onboarding pager + flow.
 *
 * Bug fixed: the old screen advanced its page index only in
 * onMomentumScrollEnd, which react-native-web never emits. On the web (what a
 * first-time visitor and Google see) "التالي" always re-targeted slide 2, the
 * last-slide CTA «ابدأ الآن» never appeared and the dots never moved. The pager
 * also ran as an LTR island inside the RTL app, so slides moved opposite to
 * the dots and the forward arrow.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { resolveBootNavigation } from '@/lib/bootRouting';
import {
  isLastOnboardingIndex,
  onboardingForwardSign,
  onboardingIndexForOffset,
  onboardingOffsetForIndex,
  onboardingProgressRange,
  onboardingSkipOpacityRange,
  onboardingSlideMotion,
  persistOnboardingComplete,
  previousOnboardingIndex,
  resolveOnboardingNext,
  resolveOnboardingPagerMode,
  type OnboardingPagerMode,
} from '@/lib/onboardingFlow';
import { ONBOARDING_SLIDES, onboardingStepLabel } from '@/constants/onboardingCopy';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const W = 390;
const N = 3;
const MODES: OnboardingPagerMode[] = ['ltr', 'rtl-native', 'rtl-web'];

/** Linear interpolation, as Animated.interpolate does with clamp. */
function interp(x: number, inputRange: number[], outputRange: number[]) {
  const [i0, i1] = inputRange;
  const [o0, o1] = outputRange;
  if (i1 === i0) return o0;
  const t = Math.min(1, Math.max(0, (x - i0) / (i1 - i0)));
  return o0 + t * (o1 - o0);
}

describe('pager mode', () => {
  it('resolves per direction and platform', () => {
    expect(resolveOnboardingPagerMode(false, 'ios')).toBe('ltr');
    expect(resolveOnboardingPagerMode(false, 'web')).toBe('ltr');
    expect(resolveOnboardingPagerMode(true, 'android')).toBe('rtl-native');
    expect(resolveOnboardingPagerMode(true, 'ios')).toBe('rtl-native');
    expect(resolveOnboardingPagerMode(true, 'web')).toBe('rtl-web');
  });
});

describe('index <-> offset (RTL mapping)', () => {
  it('LTR: page i at i * width', () => {
    expect([0, 1, 2].map((i) => onboardingOffsetForIndex(i, W, N, 'ltr'))).toEqual([0, 390, 780]);
  });

  it('native RTL: page 0 is the right-most page (same math as the swipe-tab pager)', () => {
    expect([0, 1, 2].map((i) => onboardingOffsetForIndex(i, W, N, 'rtl-native'))).toEqual([
      780, 390, 0,
    ]);
    expect(onboardingIndexForOffset(780, W, N, 'rtl-native')).toBe(0);
    expect(onboardingIndexForOffset(0, W, N, 'rtl-native')).toBe(2);
  });

  it('web RTL: scrollLeft starts at 0 on the right and goes negative', () => {
    expect([0, 1, 2].map((i) => onboardingOffsetForIndex(i, W, N, 'rtl-web'))).toEqual([
      0, -390, -780,
    ]);
    expect(onboardingIndexForOffset(0, W, N, 'rtl-web')).toBe(0);
    expect(onboardingIndexForOffset(-390, W, N, 'rtl-web')).toBe(1);
    expect(onboardingIndexForOffset(-780, W, N, 'rtl-web')).toBe(2);
  });

  it('round-trips every page in every mode and snaps mid-swipe offsets to the nearest page', () => {
    for (const mode of MODES) {
      for (let i = 0; i < N; i += 1) {
        const x = onboardingOffsetForIndex(i, W, N, mode);
        expect(onboardingIndexForOffset(x, W, N, mode)).toBe(i);
        const nudged = x + 0.4 * W * (x > 0 ? -1 : 1);
        expect(onboardingIndexForOffset(nudged, W, N, mode)).toBe(i);
      }
    }
  });

  it('clamps indices and offsets (no page outside 0..count-1)', () => {
    for (const mode of MODES) {
      expect(onboardingOffsetForIndex(-3, W, N, mode)).toBe(onboardingOffsetForIndex(0, W, N, mode));
      expect(onboardingOffsetForIndex(9, W, N, mode)).toBe(onboardingOffsetForIndex(2, W, N, mode));
      expect(onboardingIndexForOffset(99999, W, N, mode)).toBeGreaterThanOrEqual(0);
      expect(onboardingIndexForOffset(99999, W, N, mode)).toBeLessThan(N);
      expect(onboardingIndexForOffset(Number.NaN, W, N, mode)).toBe(0);
    }
    expect(onboardingOffsetForIndex(1, 0, N, 'rtl-native')).toBe(0);
    expect(onboardingOffsetForIndex(1, W, 0, 'ltr')).toBe(0);
  });
});

describe('progress (drives dots, parallax, skip fade)', () => {
  it('maps each page offset to its logical index with an ascending input range', () => {
    for (const mode of MODES) {
      const { inputRange, outputRange } = onboardingProgressRange(W, N, mode);
      expect(inputRange[0]).toBeLessThanOrEqual(inputRange[1]);
      for (let i = 0; i < N; i += 1) {
        const x = onboardingOffsetForIndex(i, W, N, mode);
        expect(interp(x, inputRange, outputRange)).toBeCloseTo(i, 6);
      }
    }
  });

  it('never produces a degenerate range for zero width', () => {
    const { inputRange } = onboardingProgressRange(0, N, 'rtl-native');
    expect(inputRange[1]).toBeGreaterThan(inputRange[0]);
  });

  it('skip fades out only while moving onto the last slide', () => {
    const { inputRange, outputRange } = onboardingSkipOpacityRange(N);
    expect(interp(0, inputRange, outputRange)).toBe(1);
    expect(interp(1, inputRange, outputRange)).toBe(1);
    expect(interp(2, inputRange, outputRange)).toBe(0);
  });
});

describe('slide motion follows the reading direction', () => {
  it('forward travel is leftward in LTR and rightward in RTL', () => {
    expect(onboardingForwardSign('ltr')).toBe(-1);
    expect(onboardingForwardSign('rtl-native')).toBe(1);
    expect(onboardingForwardSign('rtl-web')).toBe(1);
  });

  it('upcoming content lags toward the centre (parallax) and fades in', () => {
    for (const mode of MODES) {
      const m = onboardingSlideMotion(1, W, mode, false);
      const s = onboardingForwardSign(mode);
      expect(m.inputRange).toEqual([0, 1, 2]);
      expect(Math.sign(m.textTranslateX[0])).toBe(s);
      expect(m.textTranslateX[1]).toBe(0);
      expect(m.textTranslateX[2]).toBe(-m.textTranslateX[0]);
      expect(Math.abs(m.mediaTranslateX[0])).toBeLessThan(Math.abs(m.textTranslateX[0]));
      expect(m.textOpacity).toEqual([0, 1, 0]);
      expect(m.mediaScale[1]).toBe(1);
    }
  });

  it('reduced motion keeps only the fade', () => {
    const m = onboardingSlideMotion(1, W, 'rtl-native', true);
    expect(m.textTranslateX.map(Math.abs)).toEqual([0, 0, 0]);
    expect(m.mediaTranslateX.map(Math.abs)).toEqual([0, 0, 0]);
    expect(m.mediaScale).toEqual([1, 1, 1]);
    expect(m.textOpacity).toEqual([0, 1, 0]);
  });
});

describe('CTA, back and last page', () => {
  it('next advances page by page and finishes on the last slide', () => {
    expect(resolveOnboardingNext(0, N)).toEqual({ type: 'goto', index: 1 });
    expect(resolveOnboardingNext(1, N)).toEqual({ type: 'goto', index: 2 });
    expect(resolveOnboardingNext(2, N)).toEqual({ type: 'finish' });
    expect(resolveOnboardingNext(7, N)).toEqual({ type: 'finish' });
    expect(resolveOnboardingNext(0, 0)).toEqual({ type: 'finish' });
  });

  it('last-page detection clamps', () => {
    expect(isLastOnboardingIndex(0, N)).toBe(false);
    expect(isLastOnboardingIndex(2, N)).toBe(true);
    expect(isLastOnboardingIndex(5, N)).toBe(true);
    expect(isLastOnboardingIndex(0, 0)).toBe(false);
  });

  it('Android back goes to the previous slide, then yields to the system', () => {
    expect(previousOnboardingIndex(2, N)).toBe(1);
    expect(previousOnboardingIndex(1, N)).toBe(0);
    expect(previousOnboardingIndex(0, N)).toBeNull();
  });

  it('keeps the existing copy and gives screen readers a step label', () => {
    expect(ONBOARDING_SLIDES).toHaveLength(3);
    expect(onboardingStepLabel(0, 3)).toBe('1 من 3');
  });
});

describe('completion flag + redirect', () => {
  it('persists the flag under the existing key', async () => {
    const calls: [string, string][] = [];
    const ok = await persistOnboardingComplete(async (k, v) => {
      calls.push([k, v]);
    }, 'safat_onboarding_complete');
    expect(ok).toBe(true);
    expect(calls).toEqual([['safat_onboarding_complete', 'true']]);
  });

  it('a storage failure does not throw (the user is never trapped on onboarding)', async () => {
    await expect(
      persistOnboardingComplete(async () => {
        throw new Error('QuotaExceededError');
      }, 'k'),
    ).resolves.toBe(false);
    const ctx = src('contexts/OnboardingContext.tsx');
    expect(ctx).toContain("export const ONBOARDING_STORAGE_KEY = 'safat_onboarding_complete'");
    expect(ctx).toMatch(/persistOnboardingComplete\([\s\S]*?\);\s*setIsComplete\(true\);/);
  });

  it('completing onboarding leaves it (login or tabs) and never loops back', () => {
    const base = { authLoading: false, onboardingLoading: false, firstSegment: 'onboarding' };
    expect(
      resolveBootNavigation({ ...base, onboardingComplete: true, isAuthenticated: false }),
    ).toEqual({ type: 'replace', href: '/auth/phone' });
    expect(
      resolveBootNavigation({ ...base, onboardingComplete: true, isAuthenticated: true }),
    ).toEqual({ type: 'replace', href: '/(tabs)' });
    expect(
      resolveBootNavigation({ ...base, onboardingComplete: false, isAuthenticated: false }),
    ).toEqual({ type: 'stay' });
    expect(
      resolveBootNavigation({
        ...base,
        firstSegment: 'auth',
        onboardingComplete: true,
        isAuthenticated: false,
      }),
    ).toEqual({ type: 'stay' });
  });
});

describe('screen wiring (source guards)', () => {
  const screen = src('app/onboarding/index.tsx');
  const hook = src('hooks/useOnboardingPager.ts');
  const dots = src('components/onboarding/OnboardingDots.tsx');

  it('derives the page from onScroll (web-safe), not only onMomentumScrollEnd', () => {
    expect(hook).toContain('scrollX.addListener');
    expect(hook).toContain('scrollX.removeListener(id)');
    expect(hook).toContain('onboardingIndexForOffset');
    expect(hook).toContain('onScroll,');
    expect(screen).not.toContain('onMomentumScrollEnd={onMomentumScrollEnd}');
  });

  it('follows the app direction (no LTR island) and uses RN Animated only', () => {
    expect(screen).not.toMatch(/direction:\s*'ltr'/);
    expect(hook).toContain("direction: rtl ? ('rtl' as const) : ('ltr' as const)");
    for (const file of [screen, hook, dots]) {
      expect(file).not.toContain('react-native-reanimated');
      expect(file).not.toContain('react-native-pager-view');
      expect(file).not.toContain('LinearGradient');
    }
  });

  it('keeps skip / next / start, the brand and the completion path', () => {
    expect(screen).toContain('ONBOARDING_SKIP_LABEL');
    expect(screen).toContain('ONBOARDING_NEXT_LABEL');
    expect(screen).toContain('ONBOARDING_START_LABEL');
    expect(screen).toContain('BRAND_NAME_AR');
    expect(screen).toContain('completeOnboarding');
    expect(screen).toContain('finishingRef.current');
  });

  it('dots follow the live pager progress (no discrete active colour flip)', () => {
    expect(dots).toContain('progress.interpolate');
    expect(dots).not.toContain('dotActive');
    expect(dots).toContain('accessibilityRole="progressbar"');
  });

  it('cleans up listeners and timers', () => {
    expect(hook).toContain('sub?.remove?.()');
    expect(hook).toContain('sub.remove()');
    expect(hook).toContain('cancelAnimationFrame');
    expect(hook).toContain('useEffect(() => clearPending, [clearPending])');
  });
});
