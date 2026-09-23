import { readFileSync } from 'fs';
import path from 'path';
import { applyThemeScheme, colors as liveTheme, snapshotTheme } from '@/constants/theme';
import { sarh } from '@/constants/sarhTokens';
import { ds } from '@/constants/designSystem';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('light mode surface hierarchy', () => {
  afterEach(() => {
    applyThemeScheme('dark');
  });

  it('maps page, card, field, chip, and border tiers from the central theme', () => {
    applyThemeScheme('light');
    expect(liveTheme.screenRoot).toBe('#FFFFFF');
    expect(liveTheme.bgSurface).toBe('#FFFFFF');
    expect(liveTheme.bgElevated).toBe('#FFFFFF');
    expect(liveTheme.bgField).toBe('#F1F3F5');
    expect(liveTheme.royal).toBe('#F3F4F5');
    expect(liveTheme.borderSoft).toBe('#E6E8EB');
  });

  it('keeps dark mode surfaces unchanged', () => {
    applyThemeScheme('dark');
    expect(liveTheme.screenRoot).toBe('#07131C');
    expect(liveTheme.bgSurface).toBe('#0C1C27');
    expect(liveTheme.bgField).toBe(liveTheme.bgElevated);
  });

  it('routes inputs and market search through bgField and chips through royal', () => {
    expect(src('design-system/components/SarhInput.tsx')).toContain('themeColors.bgField');
    expect(src('components/market/MarketAppBar.tsx')).toContain('backgroundColor: colors.bgField');
    expect(src('components/ui/filterChipAppearance.tsx')).toContain('colors.royal');
  });

  it('keeps chat chrome on live light/dark tokens instead of fixed light fills', () => {
    const messages = src('app/(tabs)/messages.tsx');
    const appBar = src('components/ui/HomeAppBar.tsx');
    const input = src('design-system/components/SarhInput.tsx');
    expect(messages).toContain('HomeAppBar');
    expect(messages).toContain('shape="pill"');
    expect(appBar).toContain('tone="background"');
    expect(appBar).toContain('themeColors.electric');
    expect(appBar).toContain('themeColors.textPrimary');
    expect(appBar).toContain('themeColors.screenRoot');
    expect(appBar).toContain("scheme === 'light' ? ds.light : ds.dark");
    expect(appBar).toContain('tokens.glass');
    expect(appBar).toContain('tokens.glassBorder');
    expect(appBar).toContain('colors.bgField');
    expect(appBar).not.toContain('borderBottomColor: colors.borderHairline');
    expect(input).toContain('themeColors.bgField');
    expect(input).toContain('themeColors.textMuted');
    expect(input).toContain("isDark ? 'dark' : 'light'");
    const dark = snapshotTheme('dark').colors;
    const light = snapshotTheme('light').colors;
    expect(dark.bgField).not.toBe(dark.screenRoot);
    expect(light.bgField).not.toBe(light.screenRoot);
    expect(dark.textPrimary).not.toBe(light.textPrimary);
  });

  it('mirrors the light palette in sarhTokens and ds.light without duplicating dark values', () => {
    expect(sarh.color.lightBg).toBe('#F8F9FA');
    expect(sarh.color.lightField).toBe('#F1F3F5');
    expect(sarh.color.lightChip).toBe('#F3F4F5');
    expect(sarh.color.lightBorder).toBe('#E6E8EB');
    expect(ds.light.page).toBe('#F8F9FA');
    expect(ds.light.field).toBe('#F1F3F5');
    expect(ds.light.chip).toBe('#F3F4F5');
  });
});
