import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the IHDR chunk. */
function pngInfo(rel: string) {
  const buf = fs.readFileSync(path.join(root, rel));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

/** Reference black = the app-icon tile black. */
const REFERENCE_BLACK = '#020202';
const RES = 'android/app/src/main/res';
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

describe('app icon (white waves on reference black, derived from the master artwork)', () => {
  it('keeps the master artwork in assets/brand and a node generator for every size', () => {
    expect(pngInfo('assets/brand/sarh-icon-master.png')).toMatchObject({ width: 1254, height: 1254 });
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['sync:icons']).toBe('node scripts/generate-brand-icons.js');
    expect(read('scripts/generate-brand-icons.js')).toContain('assets/brand');
  });

  it('iOS / store / web icons are full-bleed opaque PNGs (no alpha, no rim)', () => {
    expect(pngInfo('assets/images/icon.png')).toEqual({ width: 1024, height: 1024, colorType: 2 });
    expect(pngInfo('assets/images/favicon.png')).toEqual({ width: 120, height: 120, colorType: 2 });
    expect(pngInfo('public/icon-192.png')).toEqual({ width: 192, height: 192, colorType: 2 });
    expect(pngInfo('public/icon-512.png')).toEqual({ width: 512, height: 512, colorType: 2 });
    expect(pngInfo('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180, colorType: 2 });
    const config = JSON.parse(read('app.json')).expo;
    expect(config.icon).toBe('./assets/images/icon.png');
    expect(config.ios.icon).toBe('./assets/images/icon.png');
    expect(config.web.favicon).toBe('./assets/images/favicon.png');
  });

  it('adaptive icon: transparent waves foreground + monochrome on a reference-black background', () => {
    expect(pngInfo('assets/images/adaptive-icon.png')).toEqual({ width: 1024, height: 1024, colorType: 6 });
    const config = JSON.parse(read('app.json')).expo;
    expect(config.android.adaptiveIcon).toEqual({
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon.png',
      backgroundColor: REFERENCE_BLACK,
    });
    const colors = read(`${RES}/values/colors.xml`);
    expect(colors).toContain(`<color name="iconBackground">${REFERENCE_BLACK}</color>`);
    expect(read(`${RES}/drawable/ic_launcher_background.xml`)).toContain(REFERENCE_BLACK);
    for (const xml of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const src = read(`${RES}/mipmap-anydpi-v26/${xml}`);
      expect(src).toContain('<background android:drawable="@color/iconBackground"/>');
      expect(src).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground"/>');
      expect(src).toContain('<monochrome android:drawable="@mipmap/ic_launcher_foreground"/>');
    }
  });

  it.each(DENSITIES)('native launcher mipmaps (%s) have the right sizes', (density, scale) => {
    const dir = `${RES}/mipmap-${density}`;
    expect(pngInfo(`${dir}/ic_launcher.png`)).toEqual({ width: 48 * scale, height: 48 * scale, colorType: 2 });
    expect(pngInfo(`${dir}/ic_launcher_round.png`)).toEqual({ width: 48 * scale, height: 48 * scale, colorType: 6 });
    expect(pngInfo(`${dir}/ic_launcher_foreground.png`)).toEqual({
      width: 108 * scale,
      height: 108 * scale,
      colorType: 6,
    });
    expect(pngInfo(`${RES}/drawable-${density}/notification_icon.png`)).toEqual({
      width: 24 * scale,
      height: 24 * scale,
      colorType: 6,
    });
  });

  it('notification icon is a dedicated silhouette tinted with the brand green', () => {
    const config = JSON.parse(read('app.json')).expo;
    const notif = config.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications',
    ) as [string, { icon: string; color: string }];
    expect(notif[1].icon).toBe('./assets/images/notification-icon.png');
    expect(notif[1].color).toBe('#0C4132');
    expect(pngInfo('assets/images/notification-icon.png').colorType).toBe(6);
    expect(read(`${RES}/values/colors.xml`)).toContain(
      '<color name="notification_icon_color">#0C4132</color>',
    );
  });

  it('native Android splash is reference black in light and dark, with light status-bar icons', () => {
    expect(read(`${RES}/values/colors.xml`)).toContain(
      `<color name="splashscreen_background">${REFERENCE_BLACK}</color>`,
    );
    expect(read(`${RES}/values/styles.xml`)).toContain(
      '<item name="android:windowLightStatusBar">false</item>',
    );
    expect(read(`${RES}/values-night/colors.xml`)).toContain(
      `<color name="splashscreen_background">${REFERENCE_BLACK}</color>`,
    );
  });

  it('PWA manifest + web theme colour use the reference black', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(
      expect.arrayContaining(['/icon-192.png', '/icon-512.png']),
    );
    expect(manifest.background_color).toBe(REFERENCE_BLACK);
    expect(manifest.theme_color).toBe(REFERENCE_BLACK);
    expect(read('lib/siteSeo.ts')).toContain(`SITE_THEME_COLOR = '${REFERENCE_BLACK}'`);
  });

  it('admin panel favicon is a multi-size ICO', () => {
    const ico = fs.readFileSync(path.join(root, '..', 'admin-panel', 'src', 'app', 'favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
  });

  it('old branding assets and generators are gone', () => {
    for (const rel of [
      'assets/images/logo.png',
      'assets/images/logo-circle.png',
      'assets/images/splash-circle.png',
      'assets/images/images',
      'scripts/sync-app-icons.py',
      'scripts/generate-circular-branding.py',
      'scripts/regen-launcher-icons.js',
    ]) {
      expect(exists(rel)).toBe(false);
    }
  });
});

describe('in-app Sarh mark colours match the icon', () => {
  const mark = read('components/ui/SarhLogoMark.tsx');

  it('exports the icon colours and draws the two waves only (no diamond)', () => {
    expect(mark).toContain(`export const SARH_LOGO_INK = '${REFERENCE_BLACK}'`);
    expect(mark).toContain("export const SARH_LOGO_INK_DARK = '#FBFBFB'");
    expect(mark).toContain('isDark ? SARH_LOGO_INK_DARK : SARH_LOGO_INK');
    expect(mark).toContain('export const SARH_LOGO_MARK_PATHS = [WAVE_BOTTOM, WAVE_TOP] as const;');
    expect(mark).not.toMatch(/DIAMOND|accentColor/);
  });

  it.each([
    'components/ui/HomeAppBar.tsx',
    'components/ui/FounderBadge.tsx',
    'app/onboarding/index.tsx',
  ])('%s renders the mark with sarhLogoColors(isDark)', (rel) => {
    const src = read(rel);
    expect(src).toContain('{...sarhLogoColors(isDark)}');
    expect(src).not.toMatch(/<SarhLogoMark[^>]*electric/);
  });

  it('launch splash is always reference black with white waves, logo only (any scheme)', () => {
    const splash = read('components/ui/LaunchSplash.tsx');
    expect(splash).toContain('const SPLASH_BG = sarh.color.darkBackground;');
    expect(splash).toContain('const SPLASH_INK = SARH_LOGO_INK_DARK;');
    expect(splash).toContain('backgroundColor: SPLASH_BG,');
    // Logo only: no wordmark text styles.
    expect(splash).not.toMatch(/color: SPLASH_INK,/);
    expect(splash).toContain('fill={SPLASH_INK}');
    expect(splash).toContain('<StatusBar style="light" />');
    expect(splash).not.toMatch(/useColorScheme|lightSurface|lightTextSecondary|DIAMOND|LOGO_ACCENT/);
  });
});
