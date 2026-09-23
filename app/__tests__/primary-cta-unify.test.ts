import { readFileSync } from 'fs';
import path from 'path';
import { applyThemeScheme } from '@/constants/theme';
import { buttonMetrics, colors, functional } from '@/design-system';
import { BUTTON_SIZE, resolveSarhButtonColors } from '@/design-system/components/resolvers';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Primary CTA button tokens', () => {
  afterEach(() => {
    applyThemeScheme('dark');
  });

  it('keeps brand green on colors.primary and success in both schemes', () => {
    applyThemeScheme('light');
    expect(colors.primary).toBe('#20B66F');
    expect(colors.success).toBe('#20B66F');
    applyThemeScheme('dark');
    expect(colors.primary).toBe('#20B66F');
    expect(colors.success).toBe('#20B66F');
    expect(colors.primary).not.toBe(resolveSarhButtonColors('primary', 'default').backgroundColor);
  });

  it('uses white primary buttons in Dark and green in Light', () => {
    applyThemeScheme('dark');
    const dark = resolveSarhButtonColors('primary', 'default');
    expect(dark.backgroundColor).toBe(functional.onPrimary);
    expect(dark.contentColor).toBe(functional.onPrimaryInverse);
    expect(resolveSarhButtonColors('primary', 'pressed').backgroundColor).toBe('#E6E8EB');

    applyThemeScheme('light');
    const light = resolveSarhButtonColors('primary', 'default');
    expect(light.backgroundColor).toBe(colors.primary);
    expect(light.contentColor).toBe(functional.onPrimary);
    expect(resolveSarhButtonColors('primary', 'pressed').backgroundColor).toBe(colors.primaryPressed);
  });

  it('shares one metric scale for every SarhButton size', () => {
    expect(BUTTON_SIZE.md.minHeight).toBe(buttonMetrics.size.md.minHeight);
    expect(buttonMetrics.size.md.minHeight).toBe(48);
    expect(buttonMetrics.size.sm.minHeight).toBe(32);
    expect(buttonMetrics.size.md.typeRole).toBe('label');
    expect(buttonMetrics.size.sm.typeRole).toBe('label');
    expect(buttonMetrics.radius).toBe(12);
    expect(buttonMetrics.gap).toBe(8);
  });

  it('resolves button chrome from tokens rather than screen hex', () => {
    const button = src('design-system/components/SarhButton.tsx');
    expect(button).toContain('resolveSarhButtonColors');
    expect(button).toContain('buttonMetrics');
    expect(button).toContain('useTheme()');
    expect(button).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(src('design-system/tokens/button.ts')).toContain('applyButtonTokens');
  });

  it('routes key primary CTAs through SarhButton', () => {
    expect(src('app/auth/welcome.tsx')).toContain('<SarhButton');
    expect(src('app/auth/phone.tsx')).toContain('<SarhButton');
    expect(src('app/auth/register.tsx')).toContain('<SarhButton');
    expect(src('app/auth/otp.tsx')).toContain('<SarhButton');
    expect(src('app/ministry/services/[id].tsx')).toContain('<SarhButton');
    expect(src('app/create/listing.tsx')).toContain('<SarhButton');
  });
});
