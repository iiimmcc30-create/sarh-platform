import type { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import { calculateListingFeeAmount } from './listing-fee';

/** Only the delegates the helper needs — keeps it testable with a plain fake. */
export type ListingFeeEnsureDb = Pick<PrismaService, 'listingFee' | 'listing'>;

export type PayableListingFee = {
  id: string;
  listingId: string;
  status: 'pending' | 'overdue';
  /** True when this call created the row (legacy listing published before the covenant). */
  created: boolean;
};

const FEE_SELECT = { id: true, listingId: true, status: true } as const;

/** Arabic messages shared by the quote and the payment initiation. */
export const LISTING_FEE_MESSAGES = {
  notFound: 'الإعلان غير موجود أو لا يخصك',
  alreadyPaid: 'تم سداد رسوم هذا الإعلان مسبقاً',
  waived: 'هذا الإعلان معفى من الرسوم',
  adminListing: 'لا تنطبق رسوم سرح على هذا الإعلان',
  deleted: 'لا يمكن إنشاء رسوم لإعلان محذوف',
  disabled: 'خدمة سداد رسوم الإعلان غير مفعّلة حالياً',
} as const;

function assertPayable(
  fee: { id: string; listingId: string; status: string },
  created: boolean,
): PayableListingFee {
  if (fee.status === 'paid') {
    throwApi(409, 'fee_already_paid', LISTING_FEE_MESSAGES.alreadyPaid);
  }
  if (fee.status === 'waived') {
    throwApi(409, 'fee_not_applicable', LISTING_FEE_MESSAGES.waived);
  }
  return {
    id: fee.id,
    listingId: fee.listingId,
    status: fee.status as 'pending' | 'overdue',
    created,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Returns the owner's payable (pending/overdue) ListingFee for a listing, creating it
 * on the fly for listings that were published without one (before the covenant / while
 * fees were off). `referenceId` may be a fee id or a listing id.
 *
 * Lazy creation only when: requester owns the listing, listing not deleted, USER origin,
 * and listingFeesEnabled. Row shape matches publish-time creation
 * (listings.repository createListingWithFee). Idempotent: ListingFee.listingId is @unique,
 * so a concurrent second create fails with P2002 and we re-read the winner's row.
 */
export async function ensurePayableListingFee(
  db: ListingFeeEnsureDb,
  params: { referenceId: string; userId: string; listingFeesEnabled: boolean },
): Promise<PayableListingFee> {
  const { referenceId, userId, listingFeesEnabled } = params;

  const existing = await db.listingFee.findFirst({
    where: { userId, OR: [{ id: referenceId }, { listingId: referenceId }] },
    select: FEE_SELECT,
  });
  if (existing) return assertPayable(existing, false);

  const listing = await db.listing.findUnique({
    where: { id: referenceId },
    select: {
      id: true,
      sellerId: true,
      origin: true,
      deletedAt: true,
      category: true,
      quantity: true,
      price: true,
    },
  });
  if (!listing || !listing.sellerId || listing.sellerId !== userId) {
    throwApi(404, 'fee_not_found', LISTING_FEE_MESSAGES.notFound);
  }
  if (listing.origin === 'ADMIN_MANAGED') {
    throwApi(409, 'fee_not_applicable', LISTING_FEE_MESSAGES.adminListing);
  }
  if (listing.deletedAt) {
    throwApi(409, 'listing_deleted', LISTING_FEE_MESSAGES.deleted);
  }
  if (!listingFeesEnabled) {
    throwApi(403, 'service_disabled', LISTING_FEE_MESSAGES.disabled);
  }

  try {
    const created = await db.listingFee.create({
      data: {
        listingId: listing.id,
        userId,
        category: listing.category,
        quantity: listing.quantity,
        price: listing.price,
        commission: calculateListingFeeAmount(listing.price),
        dueDate: null,
        status: 'pending',
      },
      select: FEE_SELECT,
    });
    return assertPayable(created, true);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost the race to a concurrent request — the row exists now.
    const winner = await db.listingFee.findFirst({
      where: { listingId: listing.id, userId },
      select: FEE_SELECT,
    });
    if (!winner) throw err;
    return assertPayable(winner, false);
  }
}
