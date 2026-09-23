import { APP_FONT_FACES } from '@/constants/fonts';
import { luxuryDark } from '@/constants/homeLuxury';
import { sarh } from '@/constants/sarhTokens';
import { colors as liveThemeColors, typography as liveTypography, applyThemeScheme } from '@/constants/theme';
import {
  colors,
  duration,
  elevation,
  fontFamily,
  fontWeight,
  functional,
  HARDCODED_AUDIT,
  LEGACY_TOKEN_MAP,
  palette,
  radius,
  semantic,
  theme,
  space,
  typography,
} from '@/design-system';

describe('Sarh design-system foundation', () => {
  afterEach(() => {
    applyThemeScheme('dark');
  });

  it('reuses the live Sarh Dark palette hex values', () => {
    expect(palette.bg).toBe('#07131C');
    expect(palette.surface).toBe('#0C1C27');
    expect(palette.surfaceRaised).toBe('#102633');
    expect(palette.surfaceAlt).toBe('#142C3A');
    expect(palette.action).toBe('#20B66F');
    expect(palette.actionPressed).toBe('#18965B');
    expect(palette.text).toBe('#F4F7F9');
    expect(palette.textSecondary).toBe('#94A6B2');
    expect(palette.textMuted).toBe('#657985');
    expect(palette.border).toBe('#1B3442');
    expect(palette.danger).toBe('#E85D5D');
    expect(palette.warning).toBe('#D4A017');
    expect(palette.success).toBe('#20B66F');

    expect(colors.background).toBe(sarh.color.bg);
    expect(colors.surface).toBe(sarh.color.surface);
    expect(colors.surfaceElevated).toBe(sarh.color.surfaceRaised);
    expect(colors.primary).toBe(sarh.color.action);
    expect(colors.primaryPressed).toBe(sarh.color.actionPressed);
    expect(colors.borderStrong).toBe('#264556');
    expect(functional.overlay).toBe(sarh.color.overlay);
    expect(functional.primaryMuted).toBe(sarh.color.actionMuted);
  });

  it('does not introduce extra brand greens', () => {
    const greens = new Set(
      Object.values({ ...palette, ...colors, ...functional }).filter((value) =>
        /^#20B66F$|^#18965B$/i.test(value),
      ),
    );
    expect(greens).toEqual(new Set(['#20B66F', '#18965B']));
    expect(colors.success).toBe(colors.primary);
  });

  it('exposes nested semantic aliases that follow applyThemeScheme', () => {
    applyThemeScheme('light');
    expect(semantic.background).toBe(colors.background);
    expect(semantic.background).toBe('#FFFFFF');
    expect(semantic.surface).toBe(colors.surface);
    expect(semantic.text.primary).toBe(colors.textPrimary);
    expect(semantic.action.primary).toBe(colors.primary);
    expect(semantic.border.default).toBe(colors.border);
    expect(theme.semantic).toBe(semantic);
    expect(theme.colors).toBe(colors);

    applyThemeScheme('dark');
    expect(semantic.background).toBe(colors.background);
    expect(semantic.background).toBe(sarh.color.bg);
    expect(semantic.surface).toBe(colors.surface);
    expect(semantic.text.primary).toBe(colors.textPrimary);
    expect(semantic.action.primaryPressed).toBe(colors.primaryPressed);
    expect(semantic.border.strong).toBe(colors.borderStrong);
    expect(semantic.status.success).toBe(colors.success);
  });

  it('maps Tajawal weights to loaded families', () => {
    expect(fontFamily.regular).toBe('Tajawal_400Regular');
    expect(fontFamily.medium).toBe('Tajawal_500Medium');
    expect(fontFamily.semiBold).toBe('Tajawal_700Bold');
    expect(fontFamily.bold).toBe('Tajawal_700Bold');
    // semiBold aliases to bold (Tajawal has no 600 face) → 3 distinct values
    expect(new Set(Object.values(fontFamily)).size).toBe(3);
    expect(APP_FONT_FACES).toEqual([
      fontFamily.regular,
      fontFamily.medium,
      fontFamily.bold,
    ]);
    expect(fontWeight.regular).toBe('400');
    expect(fontWeight.medium).toBe('500');
    expect(fontWeight.semiBold).toBe('600');
    expect(fontWeight.bold).toBe('700');
  });

  it('defines the foundation type scale without colliding weight aliases', () => {
    expect(typography.display).toMatchObject({
      fontFamily: fontFamily.bold,
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '700',
    });
    expect(typography.heading1).toMatchObject({ fontSize: 24, lineHeight: 32, fontWeight: '700' });
    expect(typography.heading2).toMatchObject({
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '600',
    });
    expect(typography.heading3).toMatchObject({ fontSize: 18, lineHeight: 26, fontWeight: '600' });
    expect(typography.body).toMatchObject({
      fontFamily: fontFamily.regular,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400',
    });
    expect(typography.bodySmall).toMatchObject({ fontSize: 14, lineHeight: 20, fontWeight: '400' });
    expect(typography.label).toMatchObject({
      fontFamily: fontFamily.medium,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
    });
    expect(typography.caption).toMatchObject({ fontSize: 12, lineHeight: 18, fontWeight: '400' });
    expect(typography.micro).toMatchObject({ fontSize: 11, lineHeight: 14, fontWeight: '400' });

    const signatures = Object.values(typography).map(
      (token) => `${token.fontFamily}:${token.fontWeight}:${token.fontSize}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('does not rewrite the live Bold-only theme typography', () => {
    expect(liveTypography.body.fontFamily).toBe('Tajawal_500Medium');
    expect(liveTypography.display.fontSize).toBe(24);
    expect(typography.display.fontSize).toBe(28);
  });

  it('uses the 4pt spacing grid and extracted radii', () => {
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
    expect(radius[8]).toBe(sarh.radius.sm);
    expect(radius[12]).toBe(sarh.radius.md);
    expect(radius[16]).toBe(sarh.radius.lg);
    expect(radius[20]).toBe(sarh.radius.xl);
    expect(radius[999]).toBe(sarh.radius.pill);
  });

  it('keeps motion durations centralized', () => {
    expect(duration).toEqual({
      instant: 0,
      press: 120,
      ui: 200,
      screen: 280,
      sheet: 320,
      slow: 360,
      shake: 50,
      fast: 120,
      normal: 200,
    });
  });

  it('documents live dark elevation recipes', () => {
    expect(elevation.card).toMatchObject({
      elevation: 1,
      shadowOpacity: 0.08,
      shadowRadius: 4,
    });
    expect(elevation.raised.elevation).toBe(3);
  });

  it('keeps legacy token paths pointing at the same live values', () => {
    expect(LEGACY_TOKEN_MAP['sarh.color.bg']).toBe(sarh.color.bg);
    expect(LEGACY_TOKEN_MAP['luxuryDark.bg']).toBe(luxuryDark.bg);
    expect(LEGACY_TOKEN_MAP['sarh.color.action']).toBe(colors.primary);
    expect(HARDCODED_AUDIT.hex).toBeGreaterThan(0);
    expect(HARDCODED_AUDIT.highGravityFiles).toContain('constants/theme.ts');
  });

  it('does not change the live dark background', () => {
    applyThemeScheme('dark');
    expect(liveThemeColors.bgPrimary).toBe(sarh.color.bg);
    expect(colors.background).toBe(liveThemeColors.bgPrimary);
  });

  it('keeps design-system semantic colors in sync with applyThemeScheme', () => {
    applyThemeScheme('light');
    expect(colors.background).toBe('#FFFFFF');
    expect(colors.surface).toBe('#FFFFFF');
    expect(colors.textPrimary).toBe('#101820');
    applyThemeScheme('dark');
    expect(colors.background).toBe(sarh.color.bg);
    expect(colors.surface).toBe(sarh.color.surface);
    expect(colors.textPrimary).toBe(sarh.color.text);
  });
});
