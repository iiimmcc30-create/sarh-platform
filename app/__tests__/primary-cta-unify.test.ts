import { readFileSync } from 'fs';
import path from 'path';
import { applyThemeScheme } from '@/constants/theme';
import { buttonMetrics, colors, functional } from '@/design-system';
import { BUTTON_SIZE, resolveSarhButtonColors } from '@/design-system/components/resolvers';
import { resolveButtonToneForScheme } from '@/design-system/tokens/button';
import { sarh } from '@/constants/sarhTokens';

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
    expect(colors.primary).toBe('#1C8354');
    expect(colors.success).toBe('#1C8354');
    applyThemeScheme('dark');
    expect(colors.primary).toBe('#24A86C');
    expect(colors.success).toBe('#24A86C');
    expect(colors.primary).not.toBe(resolveSarhButtonColors('primary', 'default').backgroundColor);
  });

  it('uses white primary buttons in Dark and green in Light', () => {
    applyThemeScheme('dark');
    const dark = resolveSarhButtonColors('primary', 'default');
    expect(dark.backgroundColor).toBe(functional.onPrimary);
    expect(dark.contentColor).toBe(functional.onPrimaryInverse);
    expect(resolveSarhButtonColors('primary', 'pressed').backgroundColor).toBe('#D7DBDC');

    applyThemeScheme('light');
    const light = resolveSarhButtonColors('primary', 'default');
    expect(light.backgroundColor).toBe(colors.primary);
    expect(light.contentColor).toBe(functional.onPrimary);
    expect(resolveSarhButtonColors('primary', 'pressed').backgroundColor).toBe(colors.primaryPressed);
  });

  it('X-style dark button system: dark identity pill, white CTA, quiet disabled tones', () => {
    const t = (variant: Parameters<typeof resolveButtonToneForScheme>[1], state: 'default' | 'pressed' | 'disabled') =>
      resolveButtonToneForScheme('dark', variant, state);
    expect(t('secondary', 'default')).toEqual({
      backgroundColor: sarh.color.darkPillButton,
      borderColor: sarh.color.darkPillBorder,
      contentColor: sarh.color.primaryText,
    });
    expect(t('secondary', 'pressed').backgroundColor).toBe(sarh.color.darkPillPressed);
    expect(t('primary', 'default')).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#FFFFFF',
      contentColor: '#020202',
    });
    for (const variant of ['primary', 'danger', 'inverse'] as const) {
      expect(t(variant, 'disabled').backgroundColor).toBe(sarh.color.darkDisabledFill);
      expect(t(variant, 'disabled').contentColor).toBe(sarh.color.darkDisabledText);
    }
    expect(t('secondary', 'disabled').contentColor).toBe(sarh.color.darkDisabledText);
    // Dark disabled relies on these tones; the opacity wash stays Light-only.
    expect(src('design-system/components/SarhButton.tsx')).toContain(
      "opacity: disabled && scheme !== 'dark' ? motion.opacity.disabled : 1",
    );
  });

  it('Light button tones are unchanged', () => {
    applyThemeScheme('light');
    const light = (state: 'default' | 'pressed' | 'disabled') => resolveButtonToneForScheme('light', 'secondary', state);
    expect(light('default')).toEqual({
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      contentColor: colors.textPrimary,
    });
    expect(resolveButtonToneForScheme('light', 'primary', 'disabled').backgroundColor).toBe('#1C8354');
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
    expect(src('app/auth/phone.tsx')).toContain('<SarhButton');
    expect(src('app/auth/register.tsx')).toContain('<SarhButton');
    expect(src('app/auth/otp.tsx')).toContain('<SarhButton');
    expect(src('app/ministry/services/[id].tsx')).toContain('<SarhButton');
    expect(src('app/create/listing.tsx')).toContain('<SarhButton');
  });
});
