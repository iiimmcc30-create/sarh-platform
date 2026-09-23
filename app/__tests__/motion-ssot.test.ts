import { readFileSync } from 'fs';
import path from 'path';
import { ds } from '@/constants/designSystem';
import { motion as themeMotion } from '@/constants/theme';
import {
  duration,
  easing,
  motion as dsMotion,
  press,
  spring,
} from '@/design-system/tokens/motion';
import { motion as exportedMotion } from '@/design-system';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Wave 2 motion — single source of truth', () => {
  it('keeps canonical duration, easing, spring, and press tokens', () => {
    expect(duration.instant).toBe(0);
    expect(duration.press).toBe(120);
    expect(duration.ui).toBe(200);
    expect(duration.screen).toBe(280);
    expect(duration.sheet).toBe(320);
    expect(duration.slow).toBe(360);
    expect(duration.shake).toBe(50);
    expect(duration.fast).toBe(duration.press);
    expect(duration.normal).toBe(duration.ui);
    expect(easing.out).toBe('ease-out');
    expect(easing.inOut).toBe('ease-in-out');
    expect(spring.snappy).toEqual({ damping: 18, stiffness: 240, mass: 0.8 });
    expect(spring.sheet).toEqual({ tension: 68, friction: 11 });
    expect(spring.success).toEqual({ tension: 80, friction: 6 });
    expect(press.scale).toBe(0.97);
    expect(press.opacity).toBe(0.88);
    expect(press.opacityCard).toBe(0.92);
    expect(dsMotion.pressScale).toBe(press.scale);
    expect(exportedMotion).toBe(dsMotion);
  });

  it('aliases theme.motion and ds.motion to the design-system tokens', () => {
    expect(themeMotion.fast).toBe(duration.press);
    expect(themeMotion.normal).toBe(duration.ui);
    expect(themeMotion.slow).toBe(duration.slow);
    expect(themeMotion.pressScale).toBe(press.scale);
    expect(themeMotion.spring).toEqual(spring.snappy);
    expect(ds.motion.duration).toBe(duration.ui);
    expect(ds.motion.easing).toBe(easing.out);
  });

  it('does not let constants define independent motion values', () => {
    const theme = src('constants/theme.ts');
    const design = src('constants/designSystem.ts');
    expect(theme).toContain("from '@/design-system/tokens/motion'");
    expect(design).toContain("from '@/design-system/tokens/motion'");
    expect(theme).not.toMatch(/fast:\s*1[34]0\b/);
    expect(theme).not.toMatch(/normal:\s*220\b/);
    expect(theme).not.toMatch(/slow:\s*300\b/);
    expect(theme).not.toMatch(/damping:\s*18\b/);
    expect(design).not.toMatch(/duration:\s*220\b/);
    expect(design).not.toMatch(/easing:\s*'ease-/);
  });
});
