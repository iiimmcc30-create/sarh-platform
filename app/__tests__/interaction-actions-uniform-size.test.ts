import { readFileSync } from 'fs';
import path from 'path';
import {
  INTERACTION_BUTTON_STYLE,
  INTERACTION_COUNT_LINE_HEIGHT,
  INTERACTION_COUNT_MIN_FONT_SCALE,
  INTERACTION_ICON_SIZE,
  INTERACTION_PULSE_SCALE,
  INTERACTION_TOUCH_MIN,
} from '@/lib/interactionActions';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('interaction buttons: uniform, fixed size (Feed + Media Viewer)', () => {
  const comp = src('components/ui/InteractionActions.tsx');

  it('every button takes an equal fixed share of the bar with a fixed height', () => {
    expect(INTERACTION_BUTTON_STYLE.flexGrow).toBe(1);
    expect(INTERACTION_BUTTON_STYLE.flexShrink).toBe(1);
    expect(INTERACTION_BUTTON_STYLE.flexBasis).toBe(0);
    expect(INTERACTION_BUTTON_STYLE.height).toBe(INTERACTION_TOUCH_MIN);
    expect(INTERACTION_BUTTON_STYLE).not.toHaveProperty('minHeight');
    expect(INTERACTION_BUTTON_STYLE).not.toHaveProperty('width');
  });

  it('icon box is the same for outline and filled icons', () => {
    expect(comp).toContain('width: INTERACTION_ICON_SIZE,\n    height: INTERACTION_ICON_SIZE,');
    expect(comp.match(/size=\{iconSize\}/g)?.length).toBe(1);
    expect(comp).toContain('const iconSize = detail ? INTERACTION_DETAIL_ICON_SIZE : INTERACTION_ICON_SIZE;');
    expect(comp).toContain("variant={filled ? 'sr' : 'rr'}");
    expect(INTERACTION_ICON_SIZE).toBe(18);
  });

  it('count text never widens the button or changes the row height', () => {
    expect(comp).toContain('numberOfLines={1}');
    expect(comp).toContain('adjustsFontSizeToFit');
    expect(comp).toContain('minimumFontScale={INTERACTION_COUNT_MIN_FONT_SCALE}');
    expect(comp).toContain('lineHeight: INTERACTION_COUNT_LINE_HEIGHT');
    expect(comp).toContain("fontVariant: ['tabular-nums']");
    expect(INTERACTION_COUNT_LINE_HEIGHT).toBeLessThanOrEqual(INTERACTION_TOUCH_MIN);
    expect(INTERACTION_COUNT_MIN_FONT_SCALE).toBeGreaterThanOrEqual(0.7);
  });

  it('the pulse is transform-only on the icon (not the count, no layout props)', () => {
    expect(INTERACTION_PULSE_SCALE).toBe(1.15);
    expect(comp).not.toMatch(/Animated\.timing\([^)]*(width|height|padding|margin)/);
    expect(comp).not.toContain('Animated.spring');
    expect(comp).not.toContain('reanimated');
  });

  it('Feed and Media Viewer both render the shared bar', () => {
    for (const rel of ['components/feature/PostItem.tsx', 'components/ui/MediaViewerModal.tsx']) {
      const file = src(rel);
      expect(file).toContain("from '@/components/ui/InteractionActions'");
      expect(file).toContain('<InteractionBar>');
      expect(file).not.toMatch(/<InteractionAction[^>]*\bstyle=/);
    }
  });
});
