/**
 * ListingCard `variant="list"` (market row) layout metrics.
 *
 * Pure module shared by the real card (components/feature/ListingCard.tsx), its
 * skeleton (components/ui/skeleton/ListingCardSkeleton.tsx) and the feed's
 * skeleton fill / separator (components/market/MarketListingsFeed.tsx), so none
 * of them can drift from the real row.
 *
 * Proportions are measured from the Haraj reference screenshot (1532 px wide,
 * card 1471 px wide) and scale with the screen width:
 *   card height      = 0.329 × card width  (image is a full-bleed square of that height ≈ 0.326 × card width)
 *   corner radius    = 0.030 × card width
 *   side margin      = 0.019 × screen width, gap between cards = 0.011 × screen width
 *   text padding     = 0.0163 × card width (inline), 0.0145 × card width (top/bottom)
 *   title            = 0.034 × screen width font, 0.041 × screen width line height
 *   meta / username  = 0.031 × screen width font, meta icon 0.042 × screen width
 *   avatar           = 0.0705 × screen width
 */
export const LISTING_LIST_RATIOS = {
  cardHeightOfCardWidth: 0.329,
  radiusOfCardWidth: 0.03,
  marginOfScreen: 0.019,
  gapOfScreen: 0.011,
  paddingInlineOfCardWidth: 0.0163,
  paddingBlockOfCardWidth: 0.0145,
  titleFontOfScreen: 0.034,
  titleLineOfScreen: 0.041,
  metaFontOfScreen: 0.031,
  metaLineOfFont: 1.35,
  metaIconOfScreen: 0.042,
  /** Reference clusters sit ~0.1×W apart; 0.06×W keeps room for a 4th (distance) item at 360pt. */
  metaGapOfScreen: 0.06,
  metaInnerGapOfScreen: 0.01,
  avatarOfScreen: 0.0705,
  sellerGapOfScreen: 0.013,
} as const;

/** Phone-width clamp: tablets / wide web keep a ~phone-sized row instead of a giant one. */
export const LISTING_LIST_MIN_WIDTH = 320;
export const LISTING_LIST_MAX_WIDTH = 500;

export const LISTING_LIST_LAYOUT = {
  titleLines: 2,
} as const;

export interface ListingListMetrics {
  /** Clamped screen width the metrics were computed for. */
  screenWidth: number;
  marginHorizontal: number;
  cardWidth: number;
  /** Card height = full-bleed image height. */
  cardHeight: number;
  /** Full-bleed square image width (= cardHeight). */
  image: number;
  radius: number;
  /** Vertical gap between cards (list separator). */
  gap: number;
  paddingHorizontal: number;
  paddingVertical: number;
  titleFontSize: number;
  titleLineHeight: number;
  metaFontSize: number;
  metaLineHeight: number;
  metaIcon: number;
  metaGap: number;
  metaInnerGap: number;
  avatar: number;
  sellerGap: number;
}

const half = (v: number) => Math.round(v * 2) / 2;

export function listingListMetrics(screenWidth: number): ListingListMetrics {
  const raw = Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : 390;
  const w = Math.min(LISTING_LIST_MAX_WIDTH, Math.max(LISTING_LIST_MIN_WIDTH, raw));
  const R = LISTING_LIST_RATIOS;
  const marginHorizontal = half(w * R.marginOfScreen);
  const cardWidth = w - marginHorizontal * 2;
  const cardHeight = Math.round(cardWidth * R.cardHeightOfCardWidth);
  const metaFontSize = half(w * R.metaFontOfScreen);
  const titleFontSize = half(w * R.titleFontOfScreen);
  return {
    screenWidth: w,
    marginHorizontal,
    cardWidth,
    cardHeight,
    image: cardHeight,
    radius: half(cardWidth * R.radiusOfCardWidth),
    gap: half(w * R.gapOfScreen),
    paddingHorizontal: half(cardWidth * R.paddingInlineOfCardWidth),
    paddingVertical: half(cardWidth * R.paddingBlockOfCardWidth),
    titleFontSize,
    // Measured pitch is 1.2× the font; floor at 1.3× so Arabic dots/descenders never clip.
    titleLineHeight: Math.max(Math.round(w * R.titleLineOfScreen), Math.round(titleFontSize * 1.3)),
    metaFontSize,
    metaLineHeight: Math.round(metaFontSize * R.metaLineOfFont),
    metaIcon: Math.round(w * R.metaIconOfScreen),
    metaGap: Math.round(w * R.metaGapOfScreen),
    metaInnerGap: Math.max(2, Math.round(w * R.metaInnerGapOfScreen)),
    avatar: Math.round(w * R.avatarOfScreen),
    sellerGap: Math.round(w * R.sellerGapOfScreen),
  };
}

/** Row pitch for skeleton fill counts: card height + separator. */
export function listingListRowPitch(screenWidth: number): number {
  const m = listingListMetrics(screenWidth);
  return m.cardHeight + m.gap;
}
