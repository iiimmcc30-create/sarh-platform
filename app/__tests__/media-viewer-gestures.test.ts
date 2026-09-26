import { containSize } from '@/lib/mediaContain';
import { formatViewerRemainingTime, mediaViewerVideoLayout } from '@/lib/mediaViewerVideoLayout';
import {
  FEED_DOUBLE_TAP_MS,
  FEED_DOUBLE_TAP_SCALE,
  VIEWER_MAX_SCALE,
  VIEWER_MIN_SCALE,
  clampPan,
  clampViewerScale,
  classifyViewerGesture,
  focalZoomOffset,
  isDoubleTap,
  isTapGesture,
  isZoomed,
  nextDoubleTapScale,
  nextOverlayVisible,
  pinchScale,
  resetTransformWhenIdle,
  shouldCancelSwipe,
  shouldCaptureFeedGesture,
  shouldDismissFromSwipe,
  touchDistance,
  viewerContainBox,
} from '@/lib/mediaViewerGestures';
import {
  pagerIndexForOffset,
  pagerOffsetForIndex,
  seekRatioFromTouch,
} from '@/lib/mediaViewerPaging';
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

describe('media viewer video layout', () => {
  it('formats remaining time like the reference control strip', () => {
    expect(formatViewerRemainingTime(97, 60)).toBe('-0:37');
    expect(formatViewerRemainingTime(0, 0)).toBe('-0:00');
  });

  it('positions video with layout props only (no transform)', () => {
    const frame = { width: 390, height: 844 };
    const box = { width: 390, height: 219 };
    const at1 = mediaViewerVideoLayout(box, frame, 1, 0, 0);
    expect(at1.left).toBe(0);
    expect(at1.top).toBeCloseTo(312.5, 0);
    const zoomed = mediaViewerVideoLayout(box, frame, 2, 10, -5);
    expect(zoomed.width).toBe(780);
    expect(zoomed.height).toBe(438);
    expect(zoomed.left).toBe(-185);
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
    expect(slide).toContain("'nativeLayout'");
    expect(src('components/feature/FeedVideoTile.tsx')).toContain('onPress={onOpen}');
    expect(src('components/feature/FeedVideoTile.tsx')).not.toContain('setPlaying(true)');
    expect(viewer).not.toContain('heroFromScale');
    expect(viewer).not.toContain('c_fill');
    expect(viewer).not.toMatch(/style=\{\[styles\.heroLayer,\s*heroStyle\]\}/);
  });
});

describe('feed video gestures (PanResponder + RN Animated)', () => {
  it('claims the responder only for pinch or zoomed pan so the feed still scrolls at 1x', () => {
    expect(shouldCaptureFeedGesture(1, 1)).toBe(false);
    expect(shouldCaptureFeedGesture(2, 1)).toBe(true);
    expect(shouldCaptureFeedGesture(1, 2)).toBe(true);
  });

  it('pinches from the two-finger distance', () => {
    const start = touchDistance({ pageX: 100, pageY: 100 }, { pageX: 200, pageY: 100 });
    const now = touchDistance({ pageX: 50, pageY: 100 }, { pageX: 250, pageY: 100 });
    expect(start).toBe(100);
    expect(pinchScale(1, now, start)).toBe(2);
  });

  it('double tap toggles 2x and back, and keeps the tapped point under the finger', () => {
    expect(nextDoubleTapScale(1)).toBe(FEED_DOUBLE_TAP_SCALE);
    expect(nextDoubleTapScale(2.5)).toBe(1);
    expect(isDoubleTap({ at: 1000, x: 10, y: 10 }, { at: 1000 + FEED_DOUBLE_TAP_MS - 1, x: 14, y: 12 })).toBe(true);
    expect(isDoubleTap({ at: 1000, x: 10, y: 10 }, { at: 1000 + FEED_DOUBLE_TAP_MS + 50, x: 10, y: 10 })).toBe(false);
    expect(isDoubleTap({ at: 1000, x: 10, y: 10 }, { at: 1100, x: 200, y: 10 })).toBe(false);
    expect(isDoubleTap(null, { at: 1100, x: 10, y: 10 })).toBe(false);
    expect(focalZoomOffset(100, 50, 200, 100, 2)).toEqual({ x: 0, y: 0 });
    expect(focalZoomOffset(0, 0, 200, 100, 2)).toEqual({ x: 100, y: 50 });
  });

  it('wires the handlers onto the View that renders the feed media surface', () => {
    const tile = src('components/feature/FeedVideoTile.tsx');
    const hook = src('lib/useFeedVideoGestures.ts');
    const surfaceStart = tile.indexOf('testID="feed-video-gesture-surface"');
    expect(surfaceStart).toBeGreaterThan(0);
    const surface = tile.slice(surfaceStart, tile.indexOf('</View>', tile.indexOf('{media}', surfaceStart)));
    expect(surface).toContain('{...panHandlers}');
    expect(surface).toContain('{...touchHandlers}');
    expect(surface).toContain('pointerEvents="none"');
    expect(surface).toContain('animatedStyle');
    expect(surface).toContain('{media}');
    // The play FAB is a sibling after the surface, not a touch-swallowing overlay inside it.
    expect(tile.indexOf('style={styles.playFab}')).toBeGreaterThan(tile.indexOf('{media}', surfaceStart));
    expect(tile).not.toContain('GestureDetector');
    expect(tile).not.toContain('react-native-reanimated');
    expect(hook).toContain('PanResponder.create');
    expect(hook).toContain('onStartShouldSetPanResponderCapture');
    expect(hook).toContain('onMoveShouldSetPanResponderCapture');
    expect(hook).toContain('onPanResponderTerminationRequest: () => false');
    expect(hook).toContain('onShouldBlockNativeResponder: () => true');
    expect(hook).not.toContain('react-native-reanimated');
    expect(hook).not.toContain('react-native-gesture-handler');
  });
});

describe('media viewer playback session contracts', () => {
  it('gives slide gestures a root inside the Modal and keeps the page across relayout', () => {
    const viewer = src('components/ui/MediaViewerModal.tsx');
    expect(viewer).toContain('<GestureHandlerRootView');
    expect(viewer).toContain('onMomentumScrollEnd={onPageSettled}');
    expect(viewer).toContain('}, [visible, initialIndex, scrollX, positionPager]);');
    expect(viewer).toContain('scrollRef.current?.scrollTo(');
  });

  it('does not recreate player listeners on slide re-render', () => {
    const slide = src('components/media-viewer/MediaViewerSlide.tsx');
    const player = src('components/feature/StoryVideoPlayer.tsx');
    expect(slide).toContain('onReady={handleReady}');
    expect(slide).not.toContain('onReady={() =>');
    expect(slide).toContain('MEDIA_LOADING_FALLBACK_RATIO');
    expect(player).toContain('onReadyRef.current?.()');
    expect(player).toContain('onFirstFrameRender={handleFirstFrame}');
    expect(player).toContain('isSameVideoPlayerSession');
    expect(player).toContain('removeVideoPlayerSubscription');
  });

  it('releases the listing preview player while the viewer is open', () => {
    const detail = src('app/listing/[id].tsx');
    const guard = detail.indexOf('{mediaViewerVisible ? (');
    expect(guard).toBeGreaterThan(0);
    expect(detail.indexOf('<ListingVideoPlayer', guard)).toBeGreaterThan(guard);
    const preview = src('components/listing/ListingVideoPlayer.tsx');
    expect(preview).toContain('claimFeedPlayback(playbackId, pauseForHandoff)');
    expect(preview).toContain('releaseFeedPlayback(playbackId)');
  });
});

describe('media viewer RTL paging (listing video opened as the first photo)', () => {
  const W = 400;

  it('maps the listing video index to the physical RTL offset', () => {
    // photos [0, 1] + video at index 2. Old math used index * width = 800,
    // which in RTL is the right-most page = item 0 (the first photo).
    const oldOffset = 2 * W;
    expect(pagerIndexForOffset(oldOffset, 3, W, true)).toBe(0);
    expect(pagerOffsetForIndex(2, 3, W, true)).toBe(0);
    expect(pagerIndexForOffset(pagerOffsetForIndex(2, 3, W, true), 3, W, true)).toBe(2);
    expect(pagerOffsetForIndex(0, 3, W, true)).toBe(800);
  });

  it('keeps LTR unchanged and clamps', () => {
    expect(pagerOffsetForIndex(2, 3, W, false)).toBe(800);
    expect(pagerIndexForOffset(800, 3, W, false)).toBe(2);
    expect(pagerIndexForOffset(5000, 3, W, false)).toBe(2);
    expect(pagerOffsetForIndex(9, 3, W, true)).toBe(0);
    expect(pagerOffsetForIndex(0, 1, W, true)).toBe(0);
  });

  it('seeks from the inline start of the bar', () => {
    expect(seekRatioFromTouch(100, 400, false)).toBe(0.25);
    expect(seekRatioFromTouch(100, 400, true)).toBe(0.75);
    expect(seekRatioFromTouch(-20, 400, false)).toBe(0);
    expect(seekRatioFromTouch(10, 0, false)).toBe(0);
  });

  it('positions the viewer pager RTL-aware and starts no player before that', () => {
    const viewer = src('components/ui/MediaViewerModal.tsx');
    expect(viewer).toContain('pagerOffsetForIndex(');
    expect(viewer).toContain('pagerIndexForOffset(');
    expect(viewer).toContain('onLayout={positionPager}');
    expect(viewer).toContain('onContentSizeChange={positionPager}');
    expect(viewer).toContain('active={visible && positioned && idx === currentIndex}');
    expect(viewer).not.toContain('initialIndex * screenW');
  });
});

describe('media viewer controls routing and playback wiring', () => {
  it('keeps the player reported by StoryVideoPlayer (no mount-time reset)', () => {
    const slide = src('components/media-viewer/MediaViewerSlide.tsx');
    expect(slide).not.toContain('setPlayer(null)');
    expect(slide).toContain('onPlayer={setPlayer}');
    expect(slide).toContain('if (itemKeyRef.current === itemKey) return;');
  });

  it('draws the controls above the slide gesture layer', () => {
    const slide = src('components/media-viewer/MediaViewerSlide.tsx');
    const catcherZ = Number(/gestureCatcher:\s*\{[^}]*zIndex:\s*(\d+)/.exec(slide)?.[1]);
    const controlsZ = Number(/bottom: controlsBottom,[\s\S]*?zIndex:\s*(\d+)/.exec(slide)?.[1]);
    expect(catcherZ).toBeGreaterThan(0);
    expect(controlsZ).toBeGreaterThan(catcherZ);
    const controls = src('components/media-viewer/MediaViewerControls.tsx');
    expect(controls).toContain('onPress={onTogglePlay}');
    expect(controls).toContain('onResponderRelease={(e) => commitSeek(ratioAt(e))}');
    expect(controls).toContain('onResponderTerminationRequest={() => false}');
  });

  it('never captures a single-finger start on the feed surface', () => {
    const hook = src('lib/useFeedVideoGestures.ts');
    expect(hook).toContain('onStartShouldSetPanResponder: () => false');
    expect(hook).toContain('shouldCaptureFeedGesture(touchCount(e), live.current.scale)');
    expect(shouldCaptureFeedGesture(1, 1)).toBe(false);
  });

  it('stops the listing preview synchronously before opening the viewer', () => {
    const detail = src('app/listing/[id].tsx');
    const press = detail.indexOf('videoPreviewPauseRef.current?.();');
    expect(press).toBeGreaterThan(0);
    expect(detail.indexOf('pauseAllFeedPlayback();', press)).toBeGreaterThan(press);
    expect(detail.indexOf('listingVideoViewerIndex(mediaItems, videoUri)', press)).toBeGreaterThan(press);
    expect(detail).toContain('pauseRef={videoPreviewPauseRef}');
    expect(src('components/listing/ListingVideoPlayer.tsx')).toContain('pauseRef.current = pauseForHandoff;');
  });
});
