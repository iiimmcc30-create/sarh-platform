/**
 * Fields a market/feed card does not render. Detail GET /listings/:id keeps
 * the full row (description, every photo, video metadata for the editor).
 */
const LIST_OMIT = [
  'covenantAccepted',
  'covenantAcceptedAt',
  'covenantVersion',
  'sellerDeclaredSold',
  'sellerDeclaredSoldAt',
  'deleteReason',
  'videoFileSize',
  'videoWidth',
  'videoHeight',
  'videoDuration',
  'geoSource',
  'deletedAt',
  'expiresAt',
  'updatedAt',
] as const;

/** Enough for the 8-line card snippet; essays stay on the detail request. */
export const LISTING_LIST_DESC_MAX = 320;

/** Upload cap is 8; the list never returns more than that. */
export const LISTING_LIST_IMAGE_MAX = 8;

/** Fixed feed page. Clients cannot raise it. */
export const LISTING_PAGE_SIZE = 20;

function clipText(value: unknown, max: number): unknown {
  if (typeof value !== 'string' || value.length <= max) return value;
  return value.slice(0, max);
}

function trimCategory(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const next = { ...(value as Record<string, unknown>) };
  delete next.emoji;
  delete next.icon;
  return next;
}

/** Shrink one listing row for a list/feed/search payload. Idempotent. */
export function trimListingForList<T>(listing: T): T {
  if (!listing || typeof listing !== 'object') return listing;
  const next = { ...(listing as Record<string, unknown>) };
  for (const key of LIST_OMIT) delete next[key];
  next.description = clipText(next.description, LISTING_LIST_DESC_MAX);
  next.arabicDescription = clipText(
    next.arabicDescription,
    LISTING_LIST_DESC_MAX,
  );
  if (Array.isArray(next.images)) {
    next.images = next.images.slice(0, LISTING_LIST_IMAGE_MAX);
  }
  if (next.seller && typeof next.seller === 'object') {
    const seller = { ...(next.seller as Record<string, unknown>) };
    delete seller.subscription;
    next.seller = seller;
  }
  if ('marketCategory' in next)
    next.marketCategory = trimCategory(next.marketCategory);
  if ('marketSubcategory' in next) {
    next.marketSubcategory = trimCategory(next.marketSubcategory);
  }
  return next as T;
}
