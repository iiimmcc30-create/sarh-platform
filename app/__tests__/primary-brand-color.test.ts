/**
 * Brand primary green from the reference image: Light #1C8354 (rgb 28,131,84).
 * Dark uses the same hue lifted for contrast on dark surfaces.
 */
import fs from 'fs';
import path from 'path';
import { sarh } from '@/constants/sarhTokens';
import { ds } from '@/constants/designSystem';
import { applyThemeScheme, colors as liveTheme, gradients } from '@/constants/theme';
import { colors, functional } from '@/design-system';
import { resolveSarhButtonColors } from '@/design-system/components/resolvers';
import { chatBubbleColors, contrastRatio } from '@/lib/chatBubbleTheme';

const DARK_SURFACES = ['#020202', '#0A0B0C', '#16181C', '#1D1F23'];

function hue(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

describe('brand primary colour', () => {
  afterEach(() => applyThemeScheme('dark'));

  it('Light primary is exactly #1C8354 across theme, DS and buttons', () => {
    expect(sarh.color.lightAction).toBe('#1C8354');
    expect(ds.light.primary).toBe('#1C8354');
    applyThemeScheme('light');
    expect(liveTheme.electric).toBe('#1C8354');
    expect(colors.primary).toBe('#1C8354');
    expect(colors.primaryPressed).toBe(sarh.color.lightActionPressed);
    expect(functional.primaryMuted).toBe(sarh.color.lightActionMuted);
    expect(resolveSarhButtonColors('primary', 'default').backgroundColor).toBe('#1C8354');
    expect(gradients.primary[0]).toBe('#1C8354');
  });

  it('white text on the Light primary passes WCAG AA', () => {
    expect(contrastRatio('#FFFFFF', '#1C8354')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', sarh.color.lightActionPressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('Dark primary keeps the hue and reaches AA text contrast on every dark surface', () => {
    expect(Math.abs(hue(sarh.color.action) - hue('#1C8354'))).toBeLessThan(1.5);
    for (const bg of DARK_SURFACES) {
      expect(contrastRatio(sarh.color.action, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(sarh.color.actionPressed, bg)).toBeGreaterThanOrEqual(3);
    }
    applyThemeScheme('dark');
    expect(colors.primary).toBe(sarh.color.action);
    expect(colors.success).toBe(colors.primary);
  });

  it('chat sent bubble tint is derived from the new primary and stays readable', () => {
    expect(chatBubbleColors.sentBg).toBe('#DFEEE7');
    expect(contrastRatio(chatBubbleColors.sentText, chatBubbleColors.sentBg)).toBeGreaterThan(7);
  });

  it('no hardcoded copies of the old primary remain in app source', () => {
    const root = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__tests__', 'android', 'ios', 'dist', '.expo'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/#20B66F|#18965B|rgba\(\s*32,\s*182,\s*111/i.test(text)) offenders.push(full);
        }
      }
    };
    for (const dir of ['app', 'components', 'constants', 'design-system', 'hooks', 'lib', 'services']) {
      walk(path.join(root, dir));
    }
    expect(offenders).toEqual([]);
  });
});
