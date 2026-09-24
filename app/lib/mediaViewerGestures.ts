import { containSizeFromRatio } from '@/lib/mediaContain';

export const VIEWER_MIN_SCALE = 1;
export const VIEWER_MAX_SCALE = 4;
export const VIEWER_DISMISS_DISTANCE = 120;
export const VIEWER_TAP_SLOP = 8;
export const VIEWER_TAP_MS = 280;
export const VIEWER_SWIPE_AXIS_RATIO = 1.15;

export type ViewerGesture = 'pinch' | 'pan' | 'swipe-down' | 'tap' | 'none';

export function clampViewerScale(scale: number): number {
  if (!Number.isFinite(scale)) return VIEWER_MIN_SCALE;
  return Math.min(VIEWER_MAX_SCALE, Math.max(VIEWER_MIN_SCALE, scale));
}

export function isZoomed(scale: number, epsilon = 0.02): boolean {
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
