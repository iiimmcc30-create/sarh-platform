/**
 * Interaction action bar tokens (comment / repost / like / views / bookmark / share).
 *
 * Source of truth: the Media Viewer overlay bar in components/ui/MediaViewerModal.tsx
 * (formerly its local `OverlayAction`). The Feed bar (components/feature/PostItem.tsx)
 * renders the same shared component, so any spacing change here applies to both.
 *
 * Pure module (no React Native imports) so tests can read the exact values.
 */

/** Icon glyph size inside every interaction button. */
export const INTERACTION_ICON_SIZE = 20;
/** Minimum width and height of each button (visible touch box). */
export const INTERACTION_TOUCH_MIN = 36;
/** Extra invisible hit area around each button on every side. */
export const INTERACTION_HIT_SLOP = 8;
/** Gap between the icon and its count. */
export const INTERACTION_ICON_COUNT_GAP = 4;
/** Count label font size. */
export const INTERACTION_COUNT_FONT_SIZE = 12;

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

/** The app-wide share glyph (Ionicons "share-social-outline" -> Lucide Share2). */
export const SHARE_ICON = 'share-social-outline';
export const SHARE_LABEL = 'مشاركة';

/**
 * Press feedback: quick scale + fade (transform/opacity only, native driver),
 * timing curves with no spring, so there is no bounce and no layout change.
 */
export const INTERACTION_PRESS_SCALE = 0.9;
export const INTERACTION_PRESS_OPACITY = 0.7;
export const INTERACTION_PRESS_IN_MS = 80;
export const INTERACTION_PRESS_OUT_MS = 140;
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
  minHeight: number;
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
 * Button box. `flexDirection: 'row'` starts at the inline start, so in Arabic the
 * icon sits on the right and the count follows it (I18nManager RTL).
 */
export const INTERACTION_BUTTON_STYLE: InteractionButtonStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: INTERACTION_ICON_COUNT_GAP,
  minHeight: INTERACTION_TOUCH_MIN,
  minWidth: INTERACTION_TOUCH_MIN,
};

/** Effective tappable size along one axis (visible box + hit slop on both sides). */
export function interactionHitArea(): number {
  return INTERACTION_TOUCH_MIN + INTERACTION_HIT_SLOP * 2;
}

/** Counts are only shown when positive. */
export function shouldShowInteractionCount(count: number | undefined | null): count is number {
  return typeof count === 'number' && count > 0;
}