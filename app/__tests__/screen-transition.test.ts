import { readFileSync } from 'fs';
import path from 'path';
import {
  FADE_SCALE_BACK_MS,
  FADE_SCALE_FROM,
  FADE_SCALE_OPEN_MS,
  fadeScaleStackScreenOptions,
  shouldSkipFadeScale,
} from '@/lib/screenTransition';
import { heroFromScale } from '@/lib/mediaOrigin';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('unified fade+scale navigation', () => {
  it('uses a direction-independent open scale and ~200ms timing', () => {
    expect(FADE_SCALE_FROM).toBe(0.96);
    expect(FADE_SCALE_OPEN_MS).toBe(200);
    expect(FADE_SCALE_BACK_MS).toBeGreaterThanOrEqual(180);
    expect(FADE_SCALE_BACK_MS).toBeLessThanOrEqual(220);
  });

  it('does not slide the default stack, including RTL', () => {
    const layout = src('app/_layout.tsx');
    expect(layout).toContain('fadeScaleScreenLayout');
    expect(layout).toContain('fadeScaleStackScreenOptions');
    expect(layout).not.toContain('stackSlideAnimation()');
    expect(layout).not.toMatch(/animation:\s*stackSlideAnimation/);
    expect(src('app/profile/edit/_layout.tsx')).not.toContain('slide_from_right');
    expect(src('app/profile/settings/_layout.tsx')).not.toContain('slide_from_right');
    expect(src('components/navigation/FadeScaleAppear.tsx')).toContain('transform: [');
    expect(src('components/navigation/FadeScaleAppear.tsx')).toContain('scale: progress.interpolate');
    expect(src('components/navigation/FadeScaleAppear.tsx')).not.toContain("slide_from_right");
    expect(src('components/navigation/FadeScaleAppear.tsx')).toContain('FADE_SCALE_FROM');
  });

  it('keeps tabs, sheets, auth, and stories on their own presentation', () => {
    expect(shouldSkipFadeScale('(tabs)')).toBe(true);
    expect(shouldSkipFadeScale('sidebar')).toBe(true);
    expect(shouldSkipFadeScale('payment/checkout')).toBe(true);
    expect(shouldSkipFadeScale('support/help')).toBe(true);
    expect(shouldSkipFadeScale('stories/view')).toBe(true);
    expect(shouldSkipFadeScale('auth/welcome')).toBe(true);
    expect(shouldSkipFadeScale('listing/[id]')).toBe(false);
    expect(shouldSkipFadeScale('chat')).toBe(false);

    const layout = src('app/_layout.tsx');
    expect(layout).toContain("name=\"(tabs)\"");
    expect(layout).toContain("presentation: 'card'");
    expect(layout).toContain("animation: 'slide_from_bottom'");
    expect(layout).toContain("name=\"stories/view\"");
  });

  it('native stack options disable horizontal animation', () => {
    const options = fadeScaleStackScreenOptions({ headerShown: false });
    expect(options.animation).toBe('none');
    expect(options.presentation).toBe('transparentModal');
    expect(options.headerShown).toBe(false);
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
    expect(viewer).toContain('contentFit="contain"');
    expect(viewer.match(/contentFit="cover"/g)?.length ?? 0).toBe(1);
  });
});
