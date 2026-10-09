import type { Prisma } from '@prisma/client';

/**
 * Honor-based commission rule: the 1% listing commission is owed only once the
 * livestock is actually sold — the seller declared the sale
 * (Listing.sellerDeclaredSold) or entered a sale amount (voluntary pay path).
 * Unpaid fee rows on unsold, hidden or deleted-without-sale listings are not
 * owed and must not be shown or counted as outstanding. `overdue` is a legacy
 * status (nothing sets it any more) and is treated like `pending`.
 */
export const UNPAID_LISTING_FEE_STATUSES = ['pending', 'overdue'] as const;

export const OWED_LISTING_FEE_WHERE: Prisma.ListingFeeWhereInput = {
  status: { in: [...UNPAID_LISTING_FEE_STATUSES] },
  OR: [{ saleAmount: { not: null } }, { listing: { sellerDeclaredSold: true } }],
};

/** Pure check used by tests and in-memory callers. */
export function isListingFeeOwed(fee: {
  status: string;
  saleAmount: number | null;
  listing?: { sellerDeclaredSold: boolean | null } | null;
}): boolean {
  if (fee.status !== 'pending' && fee.status !== 'overdue') return false;
  return fee.saleAmount != null || fee.listing?.sellerDeclaredSold === true;
}
