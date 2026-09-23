/**
 * Sarh UI Architecture V2 — the single responsive source.
 *
 * Screens must not call `Dimensions.get` and must not branch layout on
 * `Platform.OS`. Ask this hook instead; `ScreenBody` and `BottomAction`
 * already consume it, so most screens never read it directly.
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { space } from '@/design-system/tokens';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

/** Minimum width (dp) that activates each breakpoint. */
export const BREAKPOINT_MIN_WIDTH = {
  compact: 0,
  medium: 600,
  expanded: 1024,
} as const;

/**
 * Reading-comfort caps. `medium` matches the live `layout.contentMaxWidth`
 * in `@/constants/theme` — this is not a second scale.
 */
export const CONTENT_MAX_WIDTH = {
  form: 560,
  medium: 720,
  expanded: 960,
} as const;

/** `content` follows the breakpoint, `form` is capped, `full` is edge-to-edge. */
export type ContentWidth = 'content' | 'form' | 'full';

export type BreakpointMetrics = {
  gutter: number;
  maxWidth: number | null;
  columns: number;
};

export const BREAKPOINT_METRICS: Record<Breakpoint, BreakpointMetrics> = {
  compact: { gutter: space[16], maxWidth: null, columns: 1 },
  medium: { gutter: space[24], maxWidth: CONTENT_MAX_WIDTH.medium, columns: 1 },
  expanded: { gutter: space[32], maxWidth: CONTENT_MAX_WIDTH.expanded, columns: 2 },
};

export type LayoutInfo = BreakpointMetrics & {
  width: number;
  breakpoint: Breakpoint;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  /** Resolve the cap for a content preset. `null` means no cap. */
  maxWidthFor: (preset: ContentWidth) => number | null;
};

export function resolveBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINT_MIN_WIDTH.expanded) return 'expanded';
  if (width >= BREAKPOINT_MIN_WIDTH.medium) return 'medium';
  return 'compact';
}

export function resolveLayout(rawWidth: number): LayoutInfo {
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 0;
  const breakpoint = resolveBreakpoint(width);
  const metrics = BREAKPOINT_METRICS[breakpoint];

  return {
    ...metrics,
    width,
    breakpoint,
    isCompact: breakpoint === 'compact',
    isMedium: breakpoint === 'medium',
    isExpanded: breakpoint === 'expanded',
    maxWidthFor(preset) {
      if (preset === 'full') return null;
      if (preset === 'form') {
        return metrics.maxWidth == null
          ? CONTENT_MAX_WIDTH.form
          : Math.min(CONTENT_MAX_WIDTH.form, metrics.maxWidth);
      }
      return metrics.maxWidth;
    },
  };
}

export function useLayout(): LayoutInfo {
  const { width } = useWindowDimensions();
  return useMemo(() => resolveLayout(width), [width]);
}

export default useLayout;
