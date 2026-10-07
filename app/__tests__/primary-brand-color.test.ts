/**
 * Light primary = Sarh brand black #020202 (black & white identity): light CTAs
 * are black pills with white text. Dark mirrors it with the logo white #FBFBFB
 * (black labels on it). The former greens survive only as status tokens
 * (`statusGreen` #1C8354 / `darkStatusGreen` #24A86C) for the presence dot.
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

  it('Light primary is exactly the brand black #020202 across theme, DS and buttons', () => {
    expect(sarh.color.lightAction).toBe('#020202');
    expect(sarh.color.lightAction).toBe(sarh.color.bg);
    expect(sarh.color.lightActionPressed).toBe(sarh.color.surfaceRaised);
    expect(sarh.color.lightActionMuted).toBe('rgba(2, 2, 2, 0.14)');
    expect(sarh.color.lightSuccess).toBe('#020202');
    expect(ds.light.primary).toBe('#020202');
    expect(ds.light.primaryMuted).toBe(sarh.color.lightActionMuted);
    applyThemeScheme('light');
    expect(liveTheme.electric).toBe('#020202');
    expect(liveTheme.electricBright).toBe('#020202');
    expect(liveTheme.glow).toBe('#020202');
    expect(liveTheme.emerald).toBe('#020202');
    expect(liveTheme.success).toBe('#020202');
    expect(liveTheme.textBrand).toBe('#020202');
    expect(colors.primary).toBe('#020202');
    expect(colors.primaryPressed).toBe(sarh.color.lightActionPressed);
    expect(functional.primaryMuted).toBe(sarh.color.lightActionMuted);
    const cta = resolveSarhButtonColors('primary', 'default');
    expect(cta.backgroundColor).toBe('#020202');
    expect(cta.contentColor).toBe('#FFFFFF');
    expect(gradients.primary[0]).toBe('#020202');
    // Presence dot keeps a green (black would read as "no status").
    expect(functional.presence).toBe(sarh.color.statusGreen);
  });

  it('white text on the Light primary passes WCAG AA', () => {
    expect(contrastRatio('#FFFFFF', '#020202')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', sarh.color.lightActionPressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('Dark primary is the logo white and reaches AA text contrast on every dark surface', () => {
    expect(sarh.color.action).toBe('#FBFBFB');
    for (const bg of DARK_SURFACES) {
      expect(contrastRatio(sarh.color.action, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(sarh.color.actionPressed, bg)).toBeGreaterThanOrEqual(3);
    }
    applyThemeScheme('dark');
    expect(colors.primary).toBe(sarh.color.action);
    expect(colors.success).toBe(colors.primary);
    // Presence dot keeps the former dark green (white would read as "no status").
    expect(functional.presence).toBe(sarh.color.darkStatusGreen);
    expect(Math.abs(hue(sarh.color.darkStatusGreen) - hue(sarh.color.statusGreen))).toBeLessThan(1.5);
  });

  it('chat sent bubble tint is derived from the new primary (neutral grey) and stays readable', () => {
    expect(chatBubbleColors.sentBg).toBe('#DCDCDC');
    expect(chatBubbleColors.sentBg).not.toBe(chatBubbleColors.receivedBg);
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

  it('the former Light green only lives in sarhTokens (statusGreen), never hardcoded elsewhere', () => {
    const root = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__tests__', 'android', 'ios', 'dist', '.expo'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith(path.join('constants', 'sarhTokens.ts'))) {
          const text = fs.readFileSync(full, 'utf8');
          if (/#1C8354|#176B44|#E8F3EE|rgba\(\s*28,\s*131,\s*84/i.test(text)) offenders.push(full);
        }
      }
    };
    for (const dir of ['app', 'components', 'constants', 'design-system', 'hooks', 'lib', 'services']) {
      walk(path.join(root, dir));
    }
    expect(offenders).toEqual([]);
  });
});
