import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  FADE_SCALE_BACK_MS,
  FADE_SCALE_FROM,
  FADE_SCALE_OPEN_MS,
  composerModalOptions,
  iosPushAnimation,
  iosStackScreenOptions,
  screenHasOwnBackground,
} from '@/lib/screenTransition';
import { heroFromScale } from '@/lib/mediaOrigin';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('modern iOS navigation (native push + swipe-back)', () => {
  it('uses the native iOS push and an RTL-aware iOS-like slide on Android', () => {
    expect(iosPushAnimation('ios', true)).toBe('default');
    expect(iosPushAnimation('ios', false)).toBe('default');
    expect(iosPushAnimation('android', true)).toBe('ios_from_left');
    expect(iosPushAnimation('android', false)).toBe('ios_from_right');
  });

  it('enables the swipe-back gesture as a card push by default', () => {
    const options = iosStackScreenOptions({ headerShown: false }, 'ios', true);
    expect(options.animation).toBe('default');
    expect(options.presentation).toBe('card');
    expect(options.gestureEnabled).toBe(true);
    expect(options.gestureDirection).toBe('horizontal');
    expect(options.headerShown).toBe(false);
    // Callers can still opt out per screen.
    expect(iosStackScreenOptions({ gestureEnabled: false }, 'android', true).gestureEnabled).toBe(false);
  });

  it('presents composers as a full-screen cover sliding up', () => {
    const o = composerModalOptions();
    expect(o.presentation).toBe('fullScreenModal');
    expect(o.animation).toBe('slide_from_bottom');
    expect(o.gestureEnabled).toBe(false);
    const layout = src('app/_layout.tsx');
    for (const name of ['create/post', 'create/listing', 'create/story']) {
      expect(layout).toContain(`<Stack.Screen name="${name}" options={composerModalOptions()} />`);
    }
  });

  it('wires every stack to the native push (no JS fade/scale overlay)', () => {
    for (const file of ['app/_layout.tsx', 'app/profile/edit/_layout.tsx', 'app/profile/settings/_layout.tsx']) {
      const layout = src(file);
      expect(layout).toContain('screenLayout={patternScreenLayout}');
      expect(layout).toContain('iosStackScreenOptions(');
      expect(layout).not.toContain('fadeScale');
      expect(layout).not.toContain("presentation: 'transparentModal',\n          headerShown: false");
    }
    expect(existsSync(path.join(root, 'components/navigation/FadeScaleAppear.tsx'))).toBe(false);
    expect(src('app/_layout.tsx')).toContain('backgroundColor: themeColors.screenRoot');
  });

  it('keeps tabs, sheets, auth, and stories on their own presentation', () => {
    expect(screenHasOwnBackground('(tabs)')).toBe(true);
    expect(screenHasOwnBackground('sidebar')).toBe(true);
    expect(screenHasOwnBackground('support/help')).toBe(true);
    expect(screenHasOwnBackground('stories/view')).toBe(true);
    expect(screenHasOwnBackground('listing/[id]')).toBe(false);
    expect(screenHasOwnBackground('chat')).toBe(false);

    const layout = src('app/_layout.tsx');
    expect(layout).toContain("name=\"(tabs)\"");
    expect(layout).toContain("presentation: 'card'");
    expect(layout).toContain("animation: 'slide_from_bottom'");
    expect(layout).toContain("name=\"stories/view\"");
    // Transparent JS sheets stay see-through over the previous page.
    expect(layout.match(/contentStyle: \{ backgroundColor: 'transparent', \.\.\.getRtlDirection\(\) \}/g)?.length).toBe(3);
  });

  it('media viewer keeps its quick fade/scale timing', () => {
    expect(FADE_SCALE_FROM).toBe(0.96);
    expect(FADE_SCALE_OPEN_MS).toBe(200);
    expect(FADE_SCALE_BACK_MS).toBeGreaterThanOrEqual(180);
    expect(FADE_SCALE_BACK_MS).toBeLessThanOrEqual(220);
  });

  it('media viewer expands from the tapped origin instead of sliding', () => {
    expect(heroFromScale({ x: 20, y: 80, width: 200, height: 240 }, 400, 800)).toBe(0.3);
    expect(heroFromScale(null)).toBe(FADE_SCALE_FROM);
    expect(src('components/ui/ImageViewerModal.tsx')).toContain('origin');
    expect(src('components/ui/ImageViewerModal.tsx')).toContain('animationType="none"');
    expect(src('components/ui/MediaViewerModal.tsx')).toContain('origin');
    expect(src('components/feature/PostMediaGallery.tsx')).toContain('measureMediaOrigin');
    expect(src('app/listing/[id].tsx')).toContain('measureMediaOrigin');
    expect(src('app/_layout.tsx')).toContain("name=\"(tabs)\"");
  });

  it('does not use the thumbnail box as the fullscreen media scale', () => {
    const origin = src('lib/mediaOrigin.ts');
    expect(origin).toContain('FADE_SCALE_FROM');
    expect(origin).toContain('outputRange: [FADE_SCALE_FROM, 1]');
    expect(origin).not.toContain('outputRange: [heroFromScale(origin, screenW, screenH), 1]');
    const viewer = src('components/ui/MediaViewerModal.tsx');
    expect(viewer).toContain('contentFit="contain"');
    expect(viewer).toContain('containSizeFromRatio');
    expect(viewer).toContain('resizeMode="contain"');
    expect(viewer).not.toMatch(/style=\{\[styles\.heroLayer,\s*heroStyle\]\}/);
    expect(viewer.match(/contentFit="cover"/g)?.length ?? 0).toBe(1);
  });
});
