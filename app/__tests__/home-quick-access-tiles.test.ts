import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  HOME_BANNER_CTA_HREF,
  HOME_QUICK_ACCESS_ITEMS,
  QUICK_ACCESS_FONT_MAX,
  QUICK_ACCESS_FONT_MIN,
  QUICK_ACCESS_LABEL_EM,
  resolveQuickAccessTileMetrics,
} from '@/lib/homeQuickAccess';

// The catalog requires a .jpg logo; Jest has no image transform here.
jest.mock('@/constants/branding', () => ({ MEWA_FALLBACK_AVATAR: 1 }));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const quick = src('components/feature/HomeQuickAccess.tsx');

describe('Home quick access: suppliers shortcut removed from the rail only', () => {
  it('keeps the remaining shortcuts in their original order', () => {
    expect(HOME_QUICK_ACCESS_ITEMS.map((item) => item.key)).toEqual(['councils', 'bookmarks', 'settings']);
    expect(HOME_QUICK_ACCESS_ITEMS.map((item) => item.label)).toEqual(['المجالس', 'المحفوظات', 'الإعدادات']);
  });

  it('has no suppliers item in quick access', () => {
    expect(HOME_QUICK_ACCESS_ITEMS.some((item) => item.key === 'feed-suppliers')).toBe(false);
    expect(HOME_QUICK_ACCESS_ITEMS.some((item) => item.label === 'الموردين')).toBe(false);
    expect(
      HOME_QUICK_ACCESS_ITEMS.some((item) =>
        (typeof item.href === 'string' ? item.href : item.href.pathname).startsWith('/feed-suppliers'),
      ),
    ).toBe(false);
  });

  it('keeps the suppliers screens, routes and other entry points', () => {
    expect(existsSync(path.join(root, 'app/feed-suppliers/index.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'app/feed-suppliers/[id].tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'services/feedSuppliers.ts'))).toBe(true);
    expect(HOME_BANNER_CTA_HREF).toBe('/feed-suppliers');
  });

  it('keeps the other shortcuts unchanged (routes and icons)', () => {
    const [councils, bookmarks, settings] = HOME_QUICK_ACCESS_ITEMS;
    expect(councils).toMatchObject({ href: '/councils', icon: 'mic', iconTone: 'primary' });
    expect(bookmarks).toMatchObject({ href: '/bookmarks', icon: 'bookmark-outline', iconTone: 'primary' });
    expect(settings).toMatchObject({ href: '/settings', icon: 'settings-outline', iconTone: 'silver' });
  });
});

describe('Home quick access: title and tile layout', () => {
  it('title is one step down the DS scale (heading2 -> heading3), same text', () => {
    expect(quick).toContain('<AppText variant="heading3" color="textPrimary">\n          الوصول السريع');
    expect(quick).not.toContain('variant="heading2"');
  });

  it('stays one horizontal row of horizontal tiles (icon + label on one row)', () => {
    expect(quick).toContain('HOME_QUICK_ACCESS_ITEMS.map');
    expect(quick).toContain('<Row align="center" gap={tileMetrics.iconGap} style={styles.tileRow}>');
    expect(quick).not.toMatch(/flexDirection: 'column'|<Stack/);
  });

  it('tiles share the full width by the real item count (3 items, no placeholder)', () => {
    expect(HOME_QUICK_ACCESS_ITEMS).toHaveLength(3);
    // Rendered straight from the catalog: one tile per item, nothing padded in.
    expect(quick.match(/HOME_QUICK_ACCESS_ITEMS\.map\(/g)).toHaveLength(1);
    expect(quick).not.toMatch(/placeholder|Array\.from|numColumns|columns|\.length\s*<|% 4|\/ 4/i);
    // Equal flex tiles with one gap token in a plain RTL Row (not a scroller / fixed widths).
    expect(quick).toContain('<Row align="center" gap="sm" style={[styles.rail, { paddingHorizontal: gutter }]}>');
    expect(quick).toMatch(/rail: \{\s*gap: space\[8\],/);
    expect(quick).toMatch(/tile: \{\s*flex: 1,\s*minWidth: 0,/);
    expect(quick).not.toMatch(/tile: \{[^}]*\bwidth:/);
    expect(quick).not.toContain('<ScrollView');
    expect(quick).not.toContain('row-reverse');
  });

  it('centres the label on the icon midline for every shortcut', () => {
    // Tile centres its content on both axes (it was top-anchored before).
    expect(quick).toMatch(/tile: \{[^}]*justifyContent: 'center',\s*alignItems: 'center',/);
    // Logos and glyph icons share one centred box; the label line box matches it.
    expect(quick).toMatch(/iconBox: \{\s*width: ICON_BOX,\s*height: ICON_BOX,\s*alignItems: 'center',\s*justifyContent: 'center',/);
    expect(quick).toMatch(/label: \{\s*flexShrink: 1,\s*lineHeight: ICON_BOX,\s*includeFontPadding: false,\s*textAlignVertical: 'center',/);
    expect(quick).toContain('<View style={styles.iconBox}>');
    expect(quick).toContain('style={[styles.label, { fontSize: tileMetrics.fontSize, color: chip.contentColor }]}');
  });

  it('uses a compact pill chip with DS tokens: full pill radius, thin border, no gradient or heavy shadow', () => {
    // ~17% shorter than the first tile pass (48 -> 40).
    expect(quick).toMatch(/tile: \{[^}]*height: space\[40\],/);
    expect(quick).not.toMatch(/tile: \{[^}]*height: space\[48\],/);
    expect(quick).toMatch(/tile: \{[^}]*borderRadius: radius\[999\],/);
    expect(quick).not.toMatch(/tile: \{[^}]*borderRadius: radius\[12\],/);
    expect(quick).toMatch(/tile: \{[^}]*borderWidth: 1,/);
    expect(quick).not.toMatch(/LinearGradient|shadowOpacity|elevation:/);
  });
});

describe('Home quick access: full labels on narrow phones (المحفوظات was ellipsized)', () => {
  // «المحفوظات» measured with HarfBuzz in Tajawal 500: 74.6px at 15px (4.97em).
  const widest = (fontSize: number) => 4.974 * fontSize;
  const labelBudget = (m: ReturnType<typeof resolveQuickAccessTileMetrics>) =>
    m.tileWidth - 2 - 2 * m.paddingHorizontal - 20 - (m.iconGap === 'xs' ? 4 : 8);

  it('root cause: the old fixed chrome left < 51pt for a ~75pt label on 320–360pt phones', () => {
    for (const w of [320, 360]) {
      const tile = (w - 2 * 16 - 2 * 8) / 3;
      expect(tile - 2 - 24 - 20 - 8).toBeLessThan(widest(15) - 20);
    }
    expect(QUICK_ACCESS_LABEL_EM).toBeGreaterThanOrEqual(4.974);
  });

  it.each([320, 340, 360, 375, 390, 412, 430])('fits the full widest label at %ipt (compact gutter 16)', (w) => {
    const m = resolveQuickAccessTileMetrics(w, 16);
    expect(m.fontSize).toBeGreaterThanOrEqual(QUICK_ACCESS_FONT_MIN);
    expect(m.fontSize).toBeLessThanOrEqual(QUICK_ACCESS_FONT_MAX);
    expect(widest(m.fontSize)).toBeLessThanOrEqual(labelBudget(m));
  });

  it('keeps the original look where it already fits (web / wide screens)', () => {
    expect(resolveQuickAccessTileMetrics(720, 24)).toMatchObject({ paddingHorizontal: 12, iconGap: 'sm', fontSize: 15 });
    expect(resolveQuickAccessTileMetrics(960, 32)).toMatchObject({ paddingHorizontal: 12, iconGap: 'sm', fontSize: 15 });
    expect(resolveQuickAccessTileMetrics(360, 16).fontSize).toBeGreaterThanOrEqual(13.5);
  });

  it('wires the metrics into the tile without changing height, radius, border or the equal row', () => {
    expect(quick).toContain('resolveQuickAccessTileMetrics(');
    expect(quick).toContain('paddingHorizontal: tileMetrics.paddingHorizontal,');
    expect(quick).toContain('{ fontSize: tileMetrics.fontSize, color: chip.contentColor }');
    expect(quick).toContain('numberOfLines={1}');
    expect(quick).toContain('adjustsFontSizeToFit');
    expect(quick).toMatch(/tile: \{[^}]*height: space\[40\],/);
    expect(quick).toMatch(/tile: \{[^}]*borderRadius: radius\[999\],/);
    expect(quick).toMatch(/tile: \{\s*flex: 1,\s*minWidth: 0,/);
  });
});

describe('Home quick access: chips share the profile Share / Edit pill variant', () => {
  const catalog = src('lib/homeQuickAccess.ts');
  const profileHeader = src('lib/profileHeader.ts');

  it('uses the same DS secondary button variant as the profile pills', () => {
    expect(catalog).toContain("export const HOME_QUICK_ACCESS_CHIP_VARIANT = 'secondary' as const;");
    expect(profileHeader).toContain("export const PROFILE_ACTION_PILL_VARIANT = 'secondary' as const;");
    expect(quick).toContain('resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, \'default\')');
    expect(quick).toMatch(/resolveSarhButtonColorsForScheme\(\s*scheme,\s*HOME_QUICK_ACCESS_CHIP_VARIANT,\s*'pressed',?\s*\)/);
    expect(quick).toContain('backgroundColor: (pressed ? chipPressed : chip).backgroundColor');
    expect(quick).toContain('borderColor: (pressed ? chipPressed : chip).borderColor');
  });

  it('paints icon and label with the variant content color (no grey frame tokens, no hardcoded hex)', () => {
    expect(quick).toContain('color={chip.contentColor}');
    expect(quick).not.toMatch(/bgElevated|borderHairline/);
    expect(quick).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
