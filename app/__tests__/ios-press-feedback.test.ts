import { readFileSync } from 'fs';
import path from 'path';
import { spring } from '@/design-system/tokens/motion';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('iOS press feedback', () => {
  it('SpringPressable eases down while held and springs back on the native driver', () => {
    const p = src('design-system/components/SpringPressable.tsx');
    expect(p).toContain('Animated.createAnimatedComponent(Pressable)');
    expect(p).toContain('Animated.spring(scale, { toValue, ...config, useNativeDriver: true })');
    expect(p).toContain('spring.pressIn');
    expect(p).toContain('spring.pressOut');
    expect(spring.pressIn.bounciness).toBe(0);
    expect(spring.pressOut.bounciness).toBeLessThanOrEqual(6);
    expect(src('design-system/components/index.ts')).toContain("export { SpringPressable } from './SpringPressable';");
  });

  it('buttons and nav controls use the spring instead of a snapping scale', () => {
    const button = src('design-system/components/SarhButton.tsx');
    expect(button).toContain('<SpringPressable');
    expect(button).not.toContain('transform: [{ scale: pressed');
    expect(src('design-system/components/SarhIconButton.tsx')).toContain('<SpringPressable');
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain('<SpringPressable');
    expect(header).not.toContain('<Pressable');
    expect(header).toContain('borderRadius: controls.iconButton / 2');
  });

  it('list rows dim instead of shrinking (iOS lists)', () => {
    expect(src('design-system/components/SarhSettingsRow.tsx')).not.toContain('transform: [{ scale');
    const sheet = src('components/ui/ActionSheetHost.tsx');
    expect(sheet).toMatch(/itemPressed: \{\s*opacity: 0\.6,\s*\}/);
  });
});
