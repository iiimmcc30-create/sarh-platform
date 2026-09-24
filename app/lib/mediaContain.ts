/** Fit media inside a frame without crop, stretch, or extra zoom. */

export type MediaBox = {
  width: number;
  height: number;
};

export function normalizeAspectRatio(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
}

/**
 * Largest box that fits `mediaW×mediaH` inside `frameW×frameH` while keeping
 * the original aspect ratio. Never larger than the frame on either axis.
 */
export function containSize(
  mediaW: number,
  mediaH: number,
  frameW: number,
  frameH: number,
): MediaBox {
  const ratio = normalizeAspectRatio(mediaW, mediaH);
  if (!ratio || frameW <= 0 || frameH <= 0) {
    return { width: Math.max(0, frameW), height: Math.max(0, frameH) };
  }
  return containSizeFromRatio(ratio, frameW, frameH);
}

export function containSizeFromRatio(ratio: number, frameW: number, frameH: number): MediaBox {
  if (!Number.isFinite(ratio) || ratio <= 0 || frameW <= 0 || frameH <= 0) {
    return { width: Math.max(0, frameW), height: Math.max(0, frameH) };
  }
  const frameRatio = frameW / frameH;
  if (ratio > frameRatio) {
    return { width: frameW, height: frameW / ratio };
  }
  return { width: frameH * ratio, height: frameH };
}

/** Inline post-detail height: full width, native ratio, capped so meta stays reachable. */
export function detailMediaHeight(
  ratio: number | null,
  width: number,
  maxHeight: number,
  fallbackRatio = 16 / 9,
): number {
  const safeWidth = Math.max(1, width);
  const used = ratio && ratio > 0 ? ratio : fallbackRatio;
  const natural = safeWidth / used;
  const cap = maxHeight > 0 ? maxHeight : natural;
  return Math.max(1, Math.min(natural, cap));
}

export function isKnownAspect(ratio: number | null, target: number, epsilon = 0.02): boolean {
  if (!ratio || ratio <= 0) return false;
  return Math.abs(ratio - target) <= epsilon;
}
