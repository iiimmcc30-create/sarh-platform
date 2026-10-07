/**
 * Interaction action bar tokens (comment / repost / like / views / bookmark / share).
 *
 * Source of truth: the Media Viewer overlay bar in components/ui/MediaViewerModal.tsx
 * (formerly its local `OverlayAction`). The Feed bar (components/feature/PostItem.tsx)
 * renders the same shared component, so any spacing change here applies to both.
 *
 * Pure module (no React Native imports) so tests can read the exact values.
 */
import { sarh } from '@/constants/sarhTokens';

/** Icon glyph size inside every interaction button. */
export const INTERACTION_ICON_SIZE = 18;
/** Minimum width and the fixed height of each button (visible touch box). */
export const INTERACTION_TOUCH_MIN = 36;
/** Extra invisible hit area around each button on every side. */
export const INTERACTION_HIT_SLOP = 8;
/** Gap between the icon and its count. */
export const INTERACTION_ICON_COUNT_GAP = 4;
/** Count label font size. */
export const INTERACTION_COUNT_FONT_SIZE = 11;
/** Fixed count line height so the row height never depends on the glyphs shown. */
export const INTERACTION_COUNT_LINE_HEIGHT = 16;
/** Long counts shrink (never wrap or widen the button) down to this scale. */
export const INTERACTION_COUNT_MIN_FONT_SCALE = 0.75;

/**
 * Trailing compact group (X layout): bookmark + share sit together at the row's end
 * edge (far left in Arabic), icon only, no counts; share is flush with the edge.
 */
export const INTERACTION_COMPACT_WIDTH = 32;
export const INTERACTION_COMPACT_GAP = 4;
/** Vertical slop as usual; small horizontal slop so the two compact buttons never overlap. */
export const INTERACTION_COMPACT_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 } as const;

/** Bar: buttons spread edge to edge of their content column, vertically centered. */
export const INTERACTION_BAR_JUSTIFY = 'space-between' as const;
export const INTERACTION_BAR_ALIGN = 'center' as const;
export const INTERACTION_BAR_MARGIN_TOP = 4;
export const INTERACTION_BAR_PADDING_TOP = 4;
/**
 * The bar adds no horizontal padding of its own: the first/last buttons sit on the
 * edges of the host content column (Media Viewer overlay: 16px screen inset;
 * Feed: the post's text column).
 */
export const INTERACTION_BAR_PADDING_HORIZONTAL = 0;

/** State colors shared by the Feed and the Media Viewer. */
export const INTERACTION_LIKE_RED = '#F91880';
export const INTERACTION_REPOST_GREEN = '#00BA7C';
export const INTERACTION_BOOKMARK_BLUE = '#1D9BF0';

/**
 * Reposted state on theme surfaces = the scheme's brand accent (black & white
 * identity): black in Light, white in Dark — still distinct from the grey idle
 * glyph + solid when active. Dark media overlays keep the green constant.
 */
export function interactionRepostColor(scheme: 'light' | 'dark'): string {
  return scheme === 'light' ? sarh.color.lightAction : sarh.color.action;
}

/** The app-wide share glyph (Ionicons "share-social-outline" -> Lucide Share2). */
export const SHARE_ICON = 'share-social-outline';
export const SHARE_LABEL = 'مشاركة';

/**
 * Tap feedback: a short scale pulse on the icon only (1 -> 1.15 -> 1), RN Animated
 * timing with the native driver. A transform never changes layout, so nothing moves.
 */
export const INTERACTION_PULSE_SCALE = 1.15;
export const INTERACTION_PULSE_UP_MS = 90;
export const INTERACTION_PULSE_DOWN_MS = 130;
/** Dim level while a request for this action is in flight. */
export const INTERACTION_PENDING_OPACITY = 0.6;

export type InteractionBarStyle = {
  justifyContent: typeof INTERACTION_BAR_JUSTIFY;
  alignItems: typeof INTERACTION_BAR_ALIGN;
  marginTop: number;
  paddingTop: number;
  paddingHorizontal: number;
};

export type InteractionButtonStyle = {
  flexDirection: 'row';
  alignItems: 'center';
  gap: number;
  flexGrow: number;
  flexShrink: number;
  flexBasis: number;
  height: number;
  minWidth: number;
};

/** Row layout for the whole group (direction comes from getRtlRow()). */
export const INTERACTION_BAR_STYLE: InteractionBarStyle = {
  justifyContent: INTERACTION_BAR_JUSTIFY,
  alignItems: INTERACTION_BAR_ALIGN,
  marginTop: INTERACTION_BAR_MARGIN_TOP,
  paddingTop: INTERACTION_BAR_PADDING_TOP,
  paddingHorizontal: INTERACTION_BAR_PADDING_HORIZONTAL,
};

/**
 * Button box: every button gets an equal, fixed share of the bar (flex 1 / basis 0)
 * and a fixed height, so its size never depends on the count text (9 -> 10, count
 * appearing at 0 -> 1) or on liked/reposted/saved state, and neighbours never shift.
 * `flexDirection: 'row'` starts at the inline start, so in Arabic the icon sits on the
 * right and the count follows it (I18nManager RTL).
 */
export const INTERACTION_BUTTON_STYLE: InteractionButtonStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: INTERACTION_ICON_COUNT_GAP,
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  height: INTERACTION_TOUCH_MIN,
  minWidth: INTERACTION_TOUCH_MIN,
};

export type InteractionCompactButtonStyle = {
  flexDirection: 'row';
  alignItems: 'center';
  justifyContent: 'flex-end';
  width: number;
  height: number;
};

/** Compact (icon-only) button: fixed box, icon pushed to the inline end (row edge). */
export const INTERACTION_COMPACT_BUTTON_STYLE: InteractionCompactButtonStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  width: INTERACTION_COMPACT_WIDTH,
  height: INTERACTION_TOUCH_MIN,
};

export type InteractionTrailingGroupStyle = {
  alignItems: 'center';
  gap: number;
  flexShrink: number;
};

/** The trailing group never shrinks; the four main buttons share the rest equally. */
export const INTERACTION_TRAILING_GROUP_STYLE: InteractionTrailingGroupStyle = {
  alignItems: 'center',
  gap: INTERACTION_COMPACT_GAP,
  flexShrink: 0,
};

/**
 * Post detail action row (X post page): reply, repost, like, bookmark, share spread
 * edge to edge of the post column with a hairline above and below. Larger outline
 * icons and counts than the feed; every button keeps its natural width so the first
 * and last icons sit exactly on the column edges (space-between).
 */
export const INTERACTION_DETAIL_ICON_SIZE = 22;
export const INTERACTION_DETAIL_COUNT_FONT_SIZE = 13;
export const INTERACTION_DETAIL_COUNT_LINE_HEIGHT = 18;
export const INTERACTION_DETAIL_ICON_COUNT_GAP = 6;
/** Row height between the two hairlines. */
export const INTERACTION_DETAIL_BAR_HEIGHT = 48;
/** Neighbours are far apart on the detail row, so a wider slop is safe. */
export const INTERACTION_DETAIL_HIT_SLOP = { top: 6, bottom: 6, left: 12, right: 12 } as const;

export type InteractionDetailBarStyle = {
  justifyContent: typeof INTERACTION_BAR_JUSTIFY;
  alignItems: typeof INTERACTION_BAR_ALIGN;
  height: number;
  paddingHorizontal: number;
};

export const INTERACTION_DETAIL_BAR_STYLE: InteractionDetailBarStyle = {
  justifyContent: INTERACTION_BAR_JUSTIFY,
  alignItems: INTERACTION_BAR_ALIGN,
  height: INTERACTION_DETAIL_BAR_HEIGHT,
  paddingHorizontal: INTERACTION_BAR_PADDING_HORIZONTAL,
};

export type InteractionDetailButtonStyle = {
  flexDirection: 'row';
  alignItems: 'center';
  gap: number;
  flexGrow: number;
  flexShrink: number;
  height: number;
  minWidth: number;
};

/** Natural-width button (icon + count), never stretched; height fills the row. */
export const INTERACTION_DETAIL_BUTTON_STYLE: InteractionDetailButtonStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: INTERACTION_DETAIL_ICON_COUNT_GAP,
  flexGrow: 0,
  flexShrink: 0,
  height: INTERACTION_DETAIL_BAR_HEIGHT,
  minWidth: INTERACTION_DETAIL_ICON_SIZE,
};

/** Effective tappable size along one axis (visible box + hit slop on both sides). */
export function interactionHitArea(): number {
  return INTERACTION_TOUCH_MIN + INTERACTION_HIT_SLOP * 2;
}

/** Counts are only shown when positive. */
export function shouldShowInteractionCount(count: number | undefined | null): count is number {
  return typeof count === 'number' && count > 0;
}