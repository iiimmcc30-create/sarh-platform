import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the IHDR chunk. */
function pngInfo(rel: string) {
  const buf = fs.readFileSync(path.join(root, rel));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

describe('app icon (white flat icon, black waves + green diamond)', () => {
  it('iOS / store icon is a 1024 opaque PNG (no alpha channel)', () => {
    for (const rel of [
      'assets/images/icon.png',
      'assets/images/images/iOS/AppIcon.appiconset/Icon-1024@1x.png',
    ]) {
      expect(pngInfo(rel)).toEqual({ width: 1024, height: 1024, colorType: 2 });
    }
  });

  it('adaptive foreground is transparent on a white background', () => {
    expect(pngInfo('assets/images/adaptive-icon.png').colorType).toBe(6);
    const config = JSON.parse(read('app.json')).expo;
    expect(config.android.adaptiveIcon.backgroundColor).toBe('#FFFFFF');
    const colors = read('android/app/src/main/res/values/colors.xml');
    expect(colors).toContain('<color name="iconBackground">#FFFFFF</color>');
    expect(read('android/app/src/main/res/drawable/ic_launcher_background.xml')).toContain('#FFFFFF');
  });

  it('notification icon is a dedicated silhouette tinted with the icon green', () => {
    const config = JSON.parse(read('app.json')).expo;
    const notif = config.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications',
    ) as [string, { icon: string; color: string }];
    expect(notif[1].icon).toBe('./assets/images/notification-icon.png');
    expect(notif[1].color).toBe('#0C4132');
    expect(pngInfo('assets/images/notification-icon.png').colorType).toBe(6);
    expect(read('android/app/src/main/res/values/colors.xml')).toContain(
      '<color name="notification_icon_color">#0C4132</color>',
    );
  });

  it('native Android splash matches the white splash (no old dark icon)', () => {
    expect(read('android/app/src/main/res/values/colors.xml')).toContain(
      '<color name="splashscreen_background">#FFFFFF</color>',
    );
  });

  it('PWA manifest ships the new icons', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(
      expect.arrayContaining(['/icon-192.png', '/icon-512.png']),
    );
    expect(pngInfo('public/icon-512.png').width).toBe(512);
  });
});

describe('in-app Sarh mark colours match the icon', () => {
  const mark = read('components/ui/SarhLogoMark.tsx');

  it('exports the sampled icon colours', () => {
    expect(mark).toContain("export const SARH_LOGO_INK = '#1D1C1C'");
    expect(mark).toContain("export const SARH_LOGO_INK_DARK = '#FFFFFF'");
    expect(mark).toContain("export const SARH_LOGO_DIAMOND = '#0C4132'");
    expect(mark).toContain('isDark ? SARH_LOGO_INK_DARK : SARH_LOGO_INK');
    expect(mark).toContain("export const SARH_LOGO_DIAMOND_DARK = '#237B62'");
    expect(mark).toContain('isDark ? SARH_LOGO_DIAMOND_DARK : SARH_LOGO_DIAMOND');
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

  it('dark-mode diamond keeps the brand hue and reaches 3:1 on dark surfaces', () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = (h: string) => {
      const [r, g, b] = hex(h).map(lin);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hue = (h: string) => {
      const [r, g, b] = hex(h);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const raw = max === g ? (b - r) / d + 2 : max === b ? (r - g) / d + 4 : ((g - b) / d) % 6;
      return (raw * 60 + 360) % 360;
    };
    for (const bg of ['#07131C', '#0C1C27', '#102633']) {
      expect(contrast('#237B62', bg)).toBeGreaterThanOrEqual(3);
    }
    expect(Math.abs(hue('#237B62') - hue('#0C4132'))).toBeLessThan(2);
    expect(lum('#237B62')).toBeGreaterThan(lum('#0C4132'));
  });

  it('launch splash draws waves in icon black and the diamond in icon green', () => {
    const splash = read('components/ui/LaunchSplash.tsx');
    expect(splash).toContain('const LOGO_INK = SARH_LOGO_INK;');
    expect(splash).toContain('const LOGO_ACCENT = SARH_LOGO_DIAMOND;');
  });
});
