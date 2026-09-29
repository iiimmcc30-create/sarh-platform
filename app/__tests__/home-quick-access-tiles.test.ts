import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { HOME_BANNER_CTA_HREF, HOME_QUICK_ACCESS_ITEMS } from '@/lib/homeQuickAccess';

// The catalog requires a .jpg logo; Jest has no image transform here.
jest.mock('@/constants/branding', () => ({ MEWA_FALLBACK_AVATAR: 1 }));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const quick = src('components/feature/HomeQuickAccess.tsx');

describe('Home quick access: suppliers shortcut removed from the rail only', () => {
  it('keeps the remaining shortcuts in their original order', () => {
    expect(HOME_QUICK_ACCESS_ITEMS.map((item) => item.key)).toEqual(['services', 'bookmarks', 'settings']);
    expect(HOME_QUICK_ACCESS_ITEMS.map((item) => item.label)).toEqual(['الخدمات', 'المحفوظات', 'الإعدادات']);
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
    const [services, bookmarks, settings] = HOME_QUICK_ACCESS_ITEMS;
    expect(services.href).toEqual({ pathname: '/ministry', params: { tab: 'services' } });
    expect(services.logo).toBeDefined();
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
    expect(quick).toContain('<Row align="center" gap="sm" style={styles.tileRow}>');
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
    expect(quick).toContain('style={styles.label}');
  });

  it('uses a compact tile with DS tokens: light corners, thin border, no gradient or heavy shadow', () => {
    // ~17% shorter than the first tile pass (48 -> 40).
    expect(quick).toMatch(/tile: \{[^}]*height: space\[40\],/);
    expect(quick).not.toMatch(/tile: \{[^}]*height: space\[48\],/);
    expect(quick).toMatch(/tile: \{[^}]*borderRadius: radius\[12\],/);
    expect(quick).toMatch(/tile: \{[^}]*borderWidth: 1,/);
    expect(quick).not.toMatch(/LinearGradient|shadowOpacity|elevation:/);
  });
});
