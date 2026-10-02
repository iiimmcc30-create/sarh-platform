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
