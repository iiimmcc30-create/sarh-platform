/**
 * ListingCard `variant="list"` (Haraj market row) layout metrics.
 *
 * Pure module shared by the real card (components/feature/ListingCard.tsx) and
 * its skeleton (components/ui/skeleton/ListingCardSkeleton.tsx), so the
 * placeholder can never drift from the real row. Values are the frozen card
 * dimensions — do not change them here without changing the card design.
 */
export const LISTING_LIST_LAYOUT = {
  /** Square thumb — never stretches. */
  thumb: 120,
  thumbRadius: 14,
  rowPaddingVertical: 10,
  /** Gap between the text column and the thumb. */
  rowGap: 12,
  titleLines: 2,
  /** Seller avatar in the bottom line. */
  avatar: 24,
  sellerGap: 6,
  metaGap: 10,
  metaIcon: 12,
} as const;
