import { readFileSync } from 'fs';
import path from 'path';
import { heroBadgeShouldAnimate } from '@/lib/heroBadgeMotion';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('heroBadgeShouldAnimate', () => {
  it('moves only while the screen is focused and reduced motion is off', () => {
    expect(heroBadgeShouldAnimate(true, false)).toBe(true);
    expect(heroBadgeShouldAnimate(false, false)).toBe(false);
    expect(heroBadgeShouldAnimate(true, true)).toBe(false);
    expect(heroBadgeShouldAnimate(true, null)).toBe(false);
  });
});

describe('verification hero badge motion', () => {
  const hero = src('components/verification/VerificationHero.tsx');
  const motion = src('components/verification/HeroBadgeMotion.tsx');

  it('animates only the hero seal, with reanimated transform and opacity', () => {
    expect(hero).toContain('<HeroBadgeMotion tier={tier} size={badge}>');
    expect(hero).toContain('<TierBadgeMark tier={tier}');
    expect(motion).toContain("from 'react-native-reanimated'");
    expect(motion).toContain('useAnimatedStyle');
    expect(motion).toContain('translateX');
    expect(motion).toContain('rotateY');
    expect(motion).toContain('scale:');
    expect(motion).toContain('opacity:');
    expect(src('app/verification.tsx')).not.toMatch(/react-native-reanimated|HeroBadgeMotion/);
  });

  it('stops off-screen and stays still for reduced motion', () => {
    expect(motion).toContain('useIsFocused');
    expect(motion).toContain('isReduceMotionEnabled');
    expect(motion).toContain('reduceMotionChanged');
    expect(motion).toContain('heroBadgeShouldAnimate');
    expect(motion).toContain('cancelAnimation');
    expect(motion).toContain('if (!animate) return <>{children}</>');
  });

  it('leaves profile, list, and settings badges static', () => {
    const badge = src('components/ui/VerificationBadge.tsx');
    expect(badge).not.toMatch(/reanimated|HeroBadgeMotion/);
    expect(src('app/settings/verification.tsx')).not.toContain('HeroBadgeMotion');
    expect(src('components/verification/TierBadgeMark.tsx')).not.toMatch(/reanimated|HeroBadgeMotion/);
    const users = hero.match(/HeroBadgeMotion/g) ?? [];
    expect(users.length).toBeGreaterThan(0);
    const appFiles = [
      'components/feature/ProfileScreenLayout.tsx',
      'components/feature/PostItem.tsx',
      'components/feature/ListingCard.tsx',
      'components/ui/UserIdentityRow.tsx',
    ];
    for (const file of appFiles) {
      expect(src(file)).not.toContain('HeroBadgeMotion');
    }
  });
});
