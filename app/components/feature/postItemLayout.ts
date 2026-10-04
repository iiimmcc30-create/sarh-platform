/**
 * PostItem feed/profile row metrics, shared by the real row
 * (components/feature/PostItem.tsx) and PostCardSkeleton so the placeholder
 * keeps the exact avatar size, gutters and column gap.
 */
export const POST_ITEM_LAYOUT = {
  avatar: 40,
  /** Gap between the avatar and the content column. */
  rowGap: 12,
  /** Overflow menu button (three dots) in the meta line. */
  menuButton: 32,
  /** Body text top margin under the meta line. */
  bodyMarginTop: 4,
  /** Media top margin under the caption. */
  mediaMarginTop: 12,
} as const;

/**
 * Feed card header meta (@username, time): one step above the old 12px caption,
 * textSecondary like the interaction counts. The display name stays whole; the
 * handle shrinks first (down to «@…») so badges, dot and time stay visible.
 */
export const POST_META_FONT_SIZE = 13;
export const POST_META_LINE_HEIGHT = 18;
/** Room for «@…» at POST_META_FONT_SIZE. */
export const POST_HANDLE_MIN_WIDTH = 22;
/** The handle absorbs (almost) all overflow before the name gives up any width. */
export const POST_HANDLE_FLEX_SHRINK = 1000;
