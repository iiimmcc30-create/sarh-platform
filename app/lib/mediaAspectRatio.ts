/** Aspect ratio resolution for inline + fullscreen media (posts, listings). */

export const MEDIA_LOADING_FALLBACK_RATIO = 16 / 9;

export type MediaRatioInputs = {
  naturalRatio: number | null;
  cachedRatio: number | null;
  posterRatio: number | null;
};

export type ResolvedMediaRatio = {
  /** Ratio used for layout; null means show loading (no guessed 16:9 frame). */
  layoutRatio: number | null;
  /** True only while waiting for any metadata and no trusted ratio exists. */
  awaitingMetadata: boolean;
  /** True when layout uses poster until natural arrives. */
  usingPosterFallback: boolean;
};

export function resolveMediaLayoutRatio(input: MediaRatioInputs): ResolvedMediaRatio {
  const { naturalRatio, cachedRatio, posterRatio } = input;

  if (naturalRatio != null && naturalRatio > 0) {
    return { layoutRatio: naturalRatio, awaitingMetadata: false, usingPosterFallback: false };
  }
  if (cachedRatio != null && cachedRatio > 0) {
    return { layoutRatio: cachedRatio, awaitingMetadata: false, usingPosterFallback: false };
  }
  if (posterRatio != null && posterRatio > 0) {
    return { layoutRatio: posterRatio, awaitingMetadata: false, usingPosterFallback: true };
  }
  return { layoutRatio: null, awaitingMetadata: true, usingPosterFallback: false };
}

/** UX guardrail for post detail — not the primary sizing rule (width / ratio). */
export function detailMediaMaxHeight(windowHeight: number, contentWidth: number): number {
  const h = Math.max(1, windowHeight);
  const w = Math.max(1, contentWidth);
  const byScreen = h * 0.55;
  const landscapeAtWidth = w / (16 / 9);
  return Math.min(h * 0.82, Math.max(byScreen, landscapeAtWidth));
}
