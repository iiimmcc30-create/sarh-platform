import { containSizeFromRatio } from '@/lib/mediaContain';

export const VIEWER_MIN_SCALE = 1;
export const VIEWER_MAX_SCALE = 4;
export const VIEWER_DISMISS_DISTANCE = 120;
export const VIEWER_TAP_SLOP = 8;
export const VIEWER_TAP_MS = 280;
export const VIEWER_SWIPE_AXIS_RATIO = 1.15;

export type ViewerGesture = 'pinch' | 'pan' | 'swipe-down' | 'tap' | 'none';

export function clampViewerScale(scale: number): number {
  'worklet';
  if (!Number.isFinite(scale)) return VIEWER_MIN_SCALE;
  return Math.min(VIEWER_MAX_SCALE, Math.max(VIEWER_MIN_SCALE, scale));
}

export function isZoomed(scale: number, epsilon = 0.02): boolean {
  'worklet';
  return clampViewerScale(scale) > VIEWER_MIN_SCALE + epsilon;
}

export function nextOverlayVisible(visible: boolean): boolean {
  return !visible;
}

export function shouldDismissFromSwipe(dy: number, scale: number): boolean {
  if (isZoomed(scale)) return false;
  return dy >= VIEWER_DISMISS_DISTANCE;
}

export function shouldCancelSwipe(dy: number, scale: number): boolean {
  if (isZoomed(scale)) return true;
  return dy < VIEWER_DISMISS_DISTANCE;
}

export function isTapGesture(dx: number, dy: number, durationMs: number): boolean {
  return (
    Math.abs(dx) <= VIEWER_TAP_SLOP &&
    Math.abs(dy) <= VIEWER_TAP_SLOP &&
    durationMs <= VIEWER_TAP_MS
  );
}

export function classifyViewerGesture(input: {
  touches: number;
  scale: number;
  dx: number;
  dy: number;
  durationMs?: number;
}): ViewerGesture {
  if (input.touches >= 2) return 'pinch';
  if (isZoomed(input.scale)) {
    if (Math.abs(input.dx) > 2 || Math.abs(input.dy) > 2) return 'pan';
    if (input.durationMs != null && isTapGesture(input.dx, input.dy, input.durationMs)) {
      return 'tap';
    }
    return 'none';
  }
  if (input.durationMs != null && isTapGesture(input.dx, input.dy, input.durationMs)) {
    return 'tap';
  }
  if (
    input.dy > 8 &&
    input.dy >= Math.abs(input.dx) * VIEWER_SWIPE_AXIS_RATIO
  ) {
    return 'swipe-down';
  }
  return 'none';
}

export function clampPan(
  tx: number,
  ty: number,
  scale: number,
  box: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number } {
  'worklet';
  const used = clampViewerScale(scale);
  if (!isZoomed(used)) return { x: 0, y: 0 };
  const maxX = Math.max(0, (box.width * used - frame.width) / 2);
  const maxY = Math.max(0, (box.height * used - frame.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, tx)),
    y: Math.max(-maxY, Math.min(maxY, ty)),
  };
}

export function resetTransformWhenIdle(scale: number): { scale: number; x: number; y: number } {
  const used = clampViewerScale(scale);
  if (!isZoomed(used)) {
    return { scale: VIEWER_MIN_SCALE, x: 0, y: 0 };
  }
  return { scale: used, x: 0, y: 0 };
}

/** Final viewer box from native media size — never from a thumbnail rect. */
export function viewerContainBox(
  mediaWidth: number,
  mediaHeight: number,
  frameW: number,
  frameH: number,
): { width: number; height: number; ratio: number } {
  const ratio = mediaWidth / mediaHeight;
  const box = containSizeFromRatio(ratio, frameW, frameH);
  return { ...box, ratio };
}

export function pinchScale(startScale: number, distance: number, startDistance: number): number {
  if (startDistance <= 0 || !Number.isFinite(distance)) return clampViewerScale(startScale);
  return clampViewerScale(startScale * (distance / startDistance));
}

/** Feed tile double tap: zoom in to 2x, or back to 1x when already zoomed. */
export const FEED_DOUBLE_TAP_SCALE = 2;
export const FEED_DOUBLE_TAP_MS = VIEWER_TAP_MS;
export const FEED_DOUBLE_TAP_SLOP = 40;

type TouchPoint = { pageX: number; pageY: number };

export function touchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * The feed tile claims the JS responder (and blocks the native list) only for a
 * two-finger pinch or a pan while zoomed. A single finger at 1x stays with the list.
 */
export function shouldCaptureFeedGesture(touchCount: number, scale: number): boolean {
  return touchCount >= 2 || isZoomed(scale);
}

export function nextDoubleTapScale(scale: number): number {
  return isZoomed(scale) ? VIEWER_MIN_SCALE : FEED_DOUBLE_TAP_SCALE;
}

export function isDoubleTap(
  previous: { at: number; x: number; y: number } | null,
  current: { at: number; x: number; y: number },
): boolean {
  if (!previous || previous.at <= 0) return false;
  if (current.at - previous.at > FEED_DOUBLE_TAP_MS) return false;
  return Math.hypot(current.x - previous.x, current.y - previous.y) <= FEED_DOUBLE_TAP_SLOP;
}

/** Translate for a centre-origin scale so the tapped point stays under the finger. */
export function focalZoomOffset(
  locationX: number,
  locationY: number,
  width: number,
  height: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: (width / 2 - locationX) * (scale - 1),
    y: (height / 2 - locationY) * (scale - 1),
  };
}
