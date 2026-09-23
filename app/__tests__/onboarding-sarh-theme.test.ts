import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Onboarding uses Sarh identity', () => {
  const screen = src('app/onboarding/index.tsx');
  const dots = src('components/onboarding/OnboardingDots.tsx');

  it('does not use the legacy cream/ink palette', () => {
    expect(screen).not.toContain('#F4EFE6');
    expect(screen).not.toContain('#163526');
    expect(screen).not.toContain("const CREAM");
    expect(dots).not.toContain('#163526');
  });

  it('uses theme surfaces and brand mark like auth welcome', () => {
    expect(screen).toContain('colors.bgDeep');
    expect(screen).toContain('colors.electric');
    expect(screen).toContain('SarhLogoMark');
    expect(screen).toContain("from '@/components/ui/AppText'");
    expect(dots).toContain('colors.electric');
    expect(dots).toContain('useThemedStyles');
  });
});
