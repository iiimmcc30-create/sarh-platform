import { applyThemeScheme, colors as liveTheme } from '@/constants/theme';
import { createCommonStyles } from '@/constants/styles';
import { colors, functional, semantic } from '@/design-system';
import {
  SURFACE_TONE,
  resolveAppTextStyle,
  resolveSarhButtonColors,
  resolveSarhCardStyle,
  resolveSurfaceLevelStyle,
} from '@/design-system/components/resolvers';

describe('theme runtime Light ↔ Dark sync', () => {
  afterEach(() => {
    applyThemeScheme('dark');
  });

  it('updates design-system surfaces and text through a full toggle cycle', () => {
    applyThemeScheme('light');
    expect(colors.background).toBe('#FFFFFF');
    expect(colors.surface).toBe('#FFFFFF');
    expect(colors.textPrimary).toBe('#101820');
    expect(SURFACE_TONE.background).toBe('#FFFFFF');
    expect(resolveSarhCardStyle('default', 'none').backgroundColor).toBe('#FFFFFF');
    expect(resolveAppTextStyle({ color: 'textPrimary' }).color).toBe('#101820');
    expect(functional.onPrimaryInverse).toBe('#F8F9FA');
    expect(resolveSarhButtonColors('primary', 'default').backgroundColor).toBe('#1C8354');
    expect(resolveSarhButtonColors('primary', 'default').contentColor).toBe('#FFFFFF');
    expect(colors.primary).toBe('#1C8354');
    expect(colors.success).toBe('#1C8354');

    applyThemeScheme('dark');
    expect(colors.background).toBe('#020202');
    expect(colors.surface).toBe('#0A0B0C');
    expect(colors.textPrimary).toBe('#E7E9EA');
    expect(SURFACE_TONE.background).toBe('#020202');
    expect(resolveSarhCardStyle('default', 'none').backgroundColor).toBe('#0A0B0C');
    expect(resolveAppTextStyle({ color: 'textPrimary' }).color).toBe('#E7E9EA');
    expect(resolveSarhButtonColors('primary', 'default').backgroundColor).toBe('#FFFFFF');
    expect(resolveSarhButtonColors('primary', 'default').contentColor).toBe('#020202');
    expect(colors.primary).toBe('#24A86C');
    expect(colors.success).toBe('#24A86C');

    applyThemeScheme('light');
    expect(colors.background).toBe('#FFFFFF');
    expect(resolveSarhCardStyle('elevated', 'none').backgroundColor).toBe('#FFFFFF');

    applyThemeScheme('dark');
    expect(colors.background).toBe('#020202');
    expect(resolveSarhCardStyle('elevated', 'none').backgroundColor).toBe('#16181C');
  });

  it('keeps semantic aliases and surface levels on the live Dark → Light → Dark path', () => {
    applyThemeScheme('dark');
    const darkPage = resolveSurfaceLevelStyle('page').backgroundColor;
    const darkCard = resolveSurfaceLevelStyle('card').backgroundColor;
    const darkSemantic = semantic.background;
    const darkCommon = createCommonStyles().screen.backgroundColor;

    expect(darkPage).toBe(colors.background);
    expect(darkSemantic).toBe(colors.background);
    expect(darkCommon).toBe(liveTheme.bgDeep);

    applyThemeScheme('light');
    expect(semantic.background).toBe(colors.background);
    expect(semantic.background).toBe('#FFFFFF');
    expect(semantic.text.primary).toBe(colors.textPrimary);
    expect(resolveSurfaceLevelStyle('page').backgroundColor).toBe(colors.background);
    expect(resolveSurfaceLevelStyle('card').backgroundColor).toBe(colors.surface);
    expect(resolveSurfaceLevelStyle('page').backgroundColor).not.toBe(darkPage);
    expect(resolveSurfaceLevelStyle('card').backgroundColor).not.toBe(darkCard);
    expect(createCommonStyles().screen.backgroundColor).not.toBe(darkCommon);
    expect(createCommonStyles().screen.backgroundColor).toBe(liveTheme.bgDeep);

    applyThemeScheme('dark');
    expect(semantic.background).toBe(darkSemantic);
    expect(resolveSurfaceLevelStyle('page').backgroundColor).toBe(darkPage);
    expect(resolveSurfaceLevelStyle('card').backgroundColor).toBe(darkCard);
    expect(createCommonStyles().screen.backgroundColor).toBe(darkCommon);
  });
});
