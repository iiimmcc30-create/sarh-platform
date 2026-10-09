/**
 * ListingCard `variant="list"` (Haraj market row) layout metrics.
 *
 * Pure module shared by the real card (components/feature/ListingCard.tsx) and
 * its skeleton (components/ui/skeleton/ListingCardSkeleton.tsx), so the
 * placeholder can never drift from the real row.
 *
 * Full-bleed image design: the square image fills the whole card height and
 * touches the card's left edge (inline end in Arabic); the card clips it to the
 * outer corner radius. Card height is unchanged from the old inset thumb
 * (120 thumb + 2×10 padding = 140).
 */
export const LISTING_LIST_LAYOUT = {
  /** Card height (excluding the hairline border). */
  rowHeight: 140,
  /** Full-bleed image box width — square with the card height. */
  image: 140,
  /** Text column padding. */
  rowPaddingVertical: 10,
  contentPaddingHorizontal: 12,
  titleLines: 2,
  /** Seller avatar in the bottom line. */
  avatar: 24,
  sellerGap: 6,
  metaGap: 10,
  metaIcon: 12,
} as const;
