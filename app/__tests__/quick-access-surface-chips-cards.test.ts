import { readFileSync } from 'fs';
import path from 'path';
import { applyThemeScheme } from '@/constants/theme';
import { resolveSarhButtonColorsForScheme } from '@/design-system/components/resolvers';
import { HOME_QUICK_ACCESS_CHIP_VARIANT } from '@/lib/homeQuickAccess';
import { resolveQuickAccessSurface } from '@/lib/quickAccessSurface';

jest.mock('@/constants/branding', () => ({ MEWA_FALLBACK_AVATAR: 1 }));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const quick = src('components/feature/HomeQuickAccess.tsx');
const chips = src('components/ui/filterChipAppearance.tsx');
const bar = src('components/market/MarketFilterBar.tsx');
const card = src('components/feature/ListingCard.tsx');

describe('quick-access surface: filter chips + listing cards match the Home quick-access chips', () => {
  afterAll(() => applyThemeScheme('dark'));

  it.each(['light', 'dark'] as const)('resolves the exact quick-access chip colours in %s', (scheme) => {
    applyThemeScheme(scheme);
    const chip = resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, 'default');
    const pressed = resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, 'pressed');
    expect(resolveQuickAccessSurface(scheme)).toEqual(chip);
    expect(resolveQuickAccessSurface(scheme, true)).toEqual(pressed);
  });

  it('dark quick-access surface is the black pill with the subtle slate border', () => {
    applyThemeScheme('dark');
    expect(resolveQuickAccessSurface('dark')).toEqual({
      backgroundColor: '#020202',
      borderColor: '#536471',
      contentColor: '#E7E9EA',
    });
  });

  it('light quick-access surface is white with the strong light border', () => {
    applyThemeScheme('light');
    const surface = resolveQuickAccessSurface('light');
    expect(surface.backgroundColor).toBe('#FFFFFF');
    expect(surface.borderColor).toBe('#DDE1E6');
  });

  it('Home quick access still uses the same SarhButton variant', () => {
    expect(HOME_QUICK_ACCESS_CHIP_VARIANT).toBe('secondary');
    expect(quick).toContain('HOME_QUICK_ACCESS_CHIP_VARIANT');
  });

  it('shared filter chips (SarhChip filter) read idle bg / border / label / icon from quick access', () => {
    expect(chips).toContain("import { resolveQuickAccessSurface } from '@/lib/quickAccessSurface';");
    expect(chips).toContain('const quickAccess = resolveQuickAccessSurface(scheme);');
    expect(chips).toContain('borderColor: quickAccess.borderColor,');
    expect(chips).toContain('color: quickAccess.contentColor,');
    expect(chips).toContain('resolveQuickAccessSurface(scheme).contentColor');
    expect(chips).not.toContain('colors.royal');
    // Selected state keeps the existing accent fill.
    expect(chips).toMatch(/chipSelected: \{\n\s+backgroundColor: colors\.electricBright,/);
  });

  it('market filter bar (region / nearby / sort / category) uses quick-access colours, active state unchanged', () => {
    expect(bar).toContain('const quickAccess = resolveQuickAccessSurface(scheme);');
    expect(bar).toContain('backgroundColor: quickAccess.backgroundColor,');
    expect(bar).toContain('borderColor: quickAccess.borderColor,');
    expect(bar).toContain('color: quickAccess.contentColor,');
    expect(bar).toContain('backgroundColor: quickAccessPressed.backgroundColor,');
    expect(bar).not.toContain('backgroundColor: colors.bgElevated');
    expect(bar).toMatch(/chipActive: \{\n\s+borderWidth: 1,\n\s+borderColor: colors\.electricBright,/);
    // Metrics unchanged.
    expect(bar).toContain('height: MARKET_CHIP.height,');
    expect(bar).toContain('paddingHorizontal: MARKET_CHIP.paddingHorizontal,');
    expect(bar).toContain('borderRadius: radius.md,');
  });

  it('ListingCard row + haraj card take the quick-access surface colour only', () => {
    expect(card).toContain('const quickAccess = resolveQuickAccessSurface(_scheme);');
    expect(card).toMatch(/listRow: \{[^}]*backgroundColor: quickAccess\.backgroundColor,/);
    expect(card).toMatch(/listRowChrome: \{[^}]*borderColor: quickAccess\.borderColor,/);
    expect(card).toMatch(/harajCard: \{[^}]*backgroundColor: quickAccess\.backgroundColor,[^}]*borderColor: quickAccess\.borderColor,/);
    expect(card).not.toContain("backgroundColor: _scheme === 'light' ? '#FFFFFF' : colors.bgSurface");
  });

  it('ListingCard dimensions / radius / spacing are unchanged', () => {
    expect(card).toMatch(
      /listRow: \{\n\s+\.\.\.getRtlRow\(\),\n\s+alignItems: 'flex-start',\n\s+flexGrow: 0,\n\s+paddingHorizontal: spacing\.md,\n\s+paddingVertical: LISTING_LIST_LAYOUT\.rowPaddingVertical,\n\s+gap: LISTING_LIST_LAYOUT\.rowGap,/,
    );
    expect(card).toMatch(
      /listRowChrome: \{\n\s+borderRadius: MENU_CARD\.radius,\n\s+borderWidth: StyleSheet\.hairlineWidth,\n\s+borderColor: quickAccess\.borderColor,\n\s+marginHorizontal: spacing\.sm,\n\s+\.\.\.ambientShadow\(_scheme, 'soft'\),/,
    );
    expect(card).toMatch(
      /harajCard: \{\n\s+width: '100%',\n\s+backgroundColor: quickAccess\.backgroundColor,\n\s+borderRadius: radius\.xl,\n\s+overflow: 'hidden',\n\s+borderWidth: 1,\n\s+borderColor: quickAccess\.borderColor,\n\s+paddingTop: spacing\.md,\n\s+paddingHorizontal: spacing\.md,\n\s+paddingBottom: spacing\.md,\n\s+gap: spacing\.sm,/,
    );
    expect(card).toMatch(/feature: \{\n\s+width: 280,\n\s+height: 380,/);
    expect(card).toMatch(/featureCompact: \{\n\s+width: 248,\n\s+height: 268,/);
    expect(card).toContain('aspectRatio: 0.82,');
  });
});
