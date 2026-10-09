import { readFileSync } from 'fs';
import path from 'path';
import { applyThemeScheme, colors as liveColors } from '@/constants/theme';
import { resolveSarhButtonColorsForScheme } from '@/design-system/components/resolvers';
import { HOME_QUICK_ACCESS_CHIP_VARIANT } from '@/lib/homeQuickAccess';
import { resolveQuickAccessSurface } from '@/lib/quickAccessSurface';

jest.mock('@/constants/branding', () => ({ MEWA_FALLBACK_AVATAR: 1 }));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const chips = src('components/ui/filterChipAppearance.tsx');
const bar = src('components/market/MarketFilterBar.tsx');
const card = src('components/feature/ListingCard.tsx');

describe('quick-access surface: filter chips + listing cards match the Home quick-access chips', () => {
  afterAll(() => applyThemeScheme('dark'));

  it.each(['light', 'dark'] as const)('uses the secondary bg/content with the softer border in %s', (scheme) => {
    applyThemeScheme(scheme);
    const chip = resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, 'default');
    const pressed = resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, 'pressed');
    const soft = scheme === 'dark' ? '#2F3336' : '#E6E8EB';
    expect(resolveQuickAccessSurface(scheme)).toEqual({ ...chip, borderColor: soft });
    expect(resolveQuickAccessSurface(scheme, true)).toEqual({ ...pressed, borderColor: soft });
  });

  it('profile Share / Edit pills keep the stronger secondary border (not softened)', () => {
    applyThemeScheme('dark');
    expect(resolveSarhButtonColorsForScheme('dark', 'secondary', 'default').borderColor).toBe('#536471');
    applyThemeScheme('light');
    expect(resolveSarhButtonColorsForScheme('light', 'secondary', 'default').borderColor).toBe('#DDE1E6');
  });

  it('dark quick-access surface is the black pill with the soft hairline border', () => {
    applyThemeScheme('dark');
    expect(resolveQuickAccessSurface('dark')).toEqual({
      backgroundColor: '#020202',
      borderColor: '#2F3336',
      contentColor: '#E7E9EA',
    });
  });

  it('light quick-access surface is white with the soft light border', () => {
    applyThemeScheme('light');
    const surface = resolveQuickAccessSurface('light');
    expect(surface.backgroundColor).toBe('#FFFFFF');
    expect(surface.borderColor).toBe('#E6E8EB');
  });

  it('the quick-access surface keeps the same SarhButton variant (Home rail removed)', () => {
    expect(HOME_QUICK_ACCESS_CHIP_VARIANT).toBe('secondary');
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

  it('ListingCard row + haraj card take the quick-access surface colour with a subtle border', () => {
    expect(card).toContain('const quickAccess = resolveQuickAccessSurface(_scheme);');
    expect(card).toMatch(/listRow: \{[^}]*backgroundColor: quickAccess\.backgroundColor,/);
    expect(card).toMatch(/listRowChrome: \{[^}]*borderColor: colors\.borderHairline,/);
    expect(card).toMatch(/harajCard: \{[^}]*backgroundColor: quickAccess\.backgroundColor,[^}]*borderColor: colors\.borderHairline,/);
    // Card keeps the theme hairline token directly.
    expect(card).not.toContain('quickAccess.borderColor');
    expect(card).not.toContain("backgroundColor: _scheme === 'light' ? '#FFFFFF' : colors.bgSurface");
  });

  it('ListingCard dimensions / radius / spacing (full-bleed list row)', () => {
    expect(card).toMatch(
      /listRow: \{\n\s+flexGrow: 0,\n\s+backgroundColor: quickAccess\.backgroundColor,/,
    );
    // Full-bleed image row: fixed card height, clipped to the card radius.
    expect(card).toMatch(
      /listClip: \{\n\s+alignItems: 'stretch',\n\s+overflow: 'hidden',/,
    );
    // Height / radius / margin scale with the screen width (Haraj reference ratios).
    expect(card).toContain('clip: { height: m.cardHeight, borderRadius: m.radius }');
    expect(card).toContain('row: { marginHorizontal: m.marginHorizontal, borderRadius: m.radius }');
    expect(card).toMatch(
      /listRowChrome: \{\n\s+borderWidth: StyleSheet\.hairlineWidth,\n\s+borderColor: colors\.borderHairline,\n\s+\.\.\.ambientShadow\(_scheme, 'soft'\),/,
    );
    expect(card).toMatch(
      /harajCard: \{\n\s+width: '100%',\n\s+backgroundColor: quickAccess\.backgroundColor,\n\s+borderRadius: radius\.xl,\n\s+overflow: 'hidden',\n\s+borderWidth: 1,\n\s+borderColor: colors\.borderHairline,\n\s+paddingTop: spacing\.md,\n\s+paddingHorizontal: spacing\.md,\n\s+paddingBottom: spacing\.md,\n\s+gap: spacing\.sm,/,
    );
    expect(card).toMatch(/feature: \{\n\s+width: 280,\n\s+height: 380,/);
    expect(card).toMatch(/featureCompact: \{\n\s+width: 248,\n\s+height: 268,/);
    expect(card).toContain('aspectRatio: 0.82,');
  });
});

describe('ListingCard border token values', () => {
  afterAll(() => applyThemeScheme('dark'));

  it('uses the subtle hairline border in both schemes', () => {
    applyThemeScheme('dark');
    expect(liveColors.borderHairline).toBe('#2F3336');
    applyThemeScheme('light');
    expect(liveColors.borderHairline).toBe('#E6E8EB');
  });
});
