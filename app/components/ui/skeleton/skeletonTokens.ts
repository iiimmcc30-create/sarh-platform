/**
 * Skeleton loading — pure tokens and state helpers (no React Native imports,
 * so tests can read the exact values and run the phase logic in Node).
 *
 * Visual reference: X-style Explore placeholders — white page, very light grey
 * bones, calm opacity pulse (native driver), no spinners on first load.
 */

/** Bone fill on the white light-mode page (very light grey, like the reference). */
export const SKELETON_COLOR_LIGHT = '#EFF1F4';
/** Bone fill on the dark surfaces: a soft lift, never a bright block. */
export const SKELETON_COLOR_DARK = 'rgba(255,255,255,0.08)';

/** Pulse: opacity only (native driver), slow in/out so it never distracts. */
export const SKELETON_PULSE_MIN_OPACITY = 0.55;
export const SKELETON_PULSE_HALF_MS = 900;

/** Default bar radius for text lines (pill-ish, like the reference). */
export const SKELETON_TEXT_RADIUS = 4;

/** Accessible label announced once per skeleton region. */
export const SKELETON_A11Y_LABEL = 'جاري التحميل';

export function skeletonColor(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? SKELETON_COLOR_DARK : SKELETON_COLOR_LIGHT;
}

/**
 * Height of the grey bar drawn for one text line: about the glyph height of the
 * font, vertically centred inside the real line box (so the line box itself —
 * and therefore the row height — matches the real text exactly).
 */
export function skeletonTextBarHeight(fontSize: number, lineHeight: number): number {
  const bar = Math.round(fontSize * 0.72);
  return Math.max(6, Math.min(bar, lineHeight));
}

/**
 * How many skeleton rows fill the visible area on first load.
 * `available` is the viewport height left for the list, `rowHeight` the real
 * row height (including its separator).
 */
export function skeletonFillCount(
  available: number,
  rowHeight: number,
  opts: { min?: number; max?: number } = {},
): number {
  const min = opts.min ?? 3;
  const max = opts.max ?? 10;
  if (!Number.isFinite(available) || !Number.isFinite(rowHeight) || rowHeight <= 0) return min;
  const n = Math.ceil(Math.max(0, available) / rowHeight);
  return Math.max(min, Math.min(max, n));
}

export type LoadPhase = 'skeleton' | 'content' | 'empty' | 'error';

/**
 * One rule for every API-driven list/section:
 * - data present  -> always `content` (refresh / refetch / pagination never hide it)
 * - no data yet and loading -> `skeleton` (first load only)
 * - no data and failed      -> `error`
 * - no data, settled        -> `empty`
 */
export function resolveLoadPhase(input: {
  hasData: boolean;
  loading: boolean;
  failed?: boolean;
}): LoadPhase {
  if (input.hasData) return 'content';
  if (input.loading) return 'skeleton';
  if (input.failed) return 'error';
  return 'empty';
}
