import { containSize } from '@/lib/mediaContain';
import {
  VIEWER_MAX_SCALE,
  VIEWER_MIN_SCALE,
  clampPan,
  clampViewerScale,
  classifyViewerGesture,
  isTapGesture,
  isZoomed,
  nextOverlayVisible,
  pinchScale,
  resetTransformWhenIdle,
  shouldCancelSwipe,
  shouldDismissFromSwipe,
  viewerContainBox,
} from '@/lib/mediaViewerGestures';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('media viewer contain sizing', () => {
  const frame = { width: 390, height: 844 };

  it('keeps 16:9 / 9:16 / 1:1 without crop', () => {
    expect(containSize(1920, 1080, frame.width, frame.height).width / 390).toBeCloseTo(1, 5);
    expect(viewerContainBox(1920, 1080, frame.width, frame.height).ratio).toBeCloseTo(16 / 9, 5);
    expect(viewerContainBox(1080, 1920, frame.width, frame.height).ratio).toBeCloseTo(9 / 16, 5);
    expect(viewerContainBox(1200, 1200, frame.width, frame.height).ratio).toBeCloseTo(1, 5);
  });

  it('does not use a thumbnail rect as the final size', () => {
    const thumb = { width: 200, height: 240 };
    const box = viewerContainBox(1920, 1080, frame.width, frame.height);
    expect(box.width).not.toBe(thumb.width);
    expect(box.height).not.toBe(thumb.height);
    expect(box.width / box.height).not.toBeCloseTo(thumb.width / thumb.height, 2);
  });
});

describe('media viewer zoom and pan', () => {
  it('starts at 1x and clamps to 4x', () => {
    expect(VIEWER_MIN_SCALE).toBe(1);
    expect(VIEWER_MAX_SCALE).toBe(4);
    expect(clampViewerScale(1)).toBe(1);
    expect(clampViewerScale(0.2)).toBe(1);
    expect(clampViewerScale(8)).toBe(4);
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(2)).toBe(true);
  });

  it('applies pinch from the current scale', () => {
    expect(pinchScale(1, 200, 100)).toBe(2);
    expect(pinchScale(1, 800, 100)).toBe(4);
  });

  it('allows pan only while zoomed and recenters at 1x', () => {
    const box = { width: 390, height: 219 };
    const frame = { width: 390, height: 844 };
    expect(clampPan(40, 80, 1, box, frame)).toEqual({ x: 0, y: 0 });
    const zoomed = clampPan(400, 20, 3, box, frame);
    expect(Math.abs(zoomed.x)).toBeGreaterThan(0);
    expect(resetTransformWhenIdle(1)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe('media viewer swipe and overlay tap', () => {
  it('dismisses only when scale is 1 and the swipe crosses the threshold', () => {
    expect(shouldDismissFromSwipe(140, 1)).toBe(true);
    expect(shouldDismissFromSwipe(140, 2)).toBe(false);
    expect(shouldDismissFromSwipe(40, 1)).toBe(false);
    expect(shouldCancelSwipe(40, 1)).toBe(true);
    expect(shouldCancelSwipe(140, 1)).toBe(false);
    expect(classifyViewerGesture({ touches: 1, scale: 1, dx: 4, dy: 80 })).toBe('swipe-down');
    expect(classifyViewerGesture({ touches: 1, scale: 2, dx: 4, dy: 80 })).toBe('pan');
    expect(classifyViewerGesture({ touches: 2, scale: 1, dx: 0, dy: 0 })).toBe('pinch');
  });

  it('toggles overlay on a tap and never treats a tap as dismiss', () => {
    expect(isTapGesture(2, 1, 120)).toBe(true);
    expect(nextOverlayVisible(true)).toBe(false);
    expect(nextOverlayVisible(false)).toBe(true);
    expect(classifyViewerGesture({ touches: 1, scale: 1, dx: 1, dy: 1, durationMs: 90 })).toBe(
      'tap',
    );
    expect(shouldDismissFromSwipe(2, 1)).toBe(false);
  });
});

describe('media viewer source contracts', () => {
  it('keeps video contain and does not size from the thumbnail hero scale', () => {
    const viewer = src('components/ui/MediaViewerModal.tsx');
    const slide = src('components/media-viewer/MediaViewerSlide.tsx');
    expect(slide).toContain('contentFit="contain"');
    expect(slide).toContain('containSizeFromRatio');
    expect(slide).toContain('resizeMode="contain"');
    expect(viewer).toContain('MediaViewerSlide');
    expect(src('lib/mediaViewerGestures.ts')).toContain('VIEWER_MAX_SCALE');
    expect(src('lib/useMediaViewerTransform.ts')).toContain('shouldDismissFromSwipe');
    expect(viewer).toContain('nextOverlayVisible');
    expect(slide).toContain('nativeControls={false}');
    expect(viewer).not.toContain('heroFromScale');
    expect(viewer).not.toContain('c_fill');
    expect(viewer).not.toMatch(/style=\{\[styles\.heroLayer,\s*heroStyle\]\}/);
  });
});
