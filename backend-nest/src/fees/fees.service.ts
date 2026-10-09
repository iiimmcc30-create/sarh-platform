import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COMMISSION_TABLE } from '../lib/commissions';
import { throwApi } from '../common/exceptions/api.exception';
import { PaidServicesService } from '../settings/paid-services.service';
import { ensurePayableListingFee } from '../listings/listing-fee-ensure';
import { OWED_LISTING_FEE_WHERE } from '../listings/listing-fee-owed';
import {
  calculateListingFeeAmount,
  LISTING_COMMISSION_PERCENT,
  parsePositiveMoneyAmount,
} from '../listings/listing-fee';

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidServices: PaidServicesService,
  ) {}

  getRules() {
    return { rules: COMMISSION_TABLE };
  }

  /**
   * «سداد الرسوم» list. Business rule: the 1% commission is due only when the
   * livestock is actually sold, and paying it is honor-based and optional.
   *
   * A fee is listed only when it is paid, or the seller declared the sale
   * (listing.sellerDeclaredSold) or entered a sale amount (voluntary pay path:
   * quote/initiate records saleAmount). Unsold, hidden and deleted-without-sale
   * listings never appear, waived fees are dropped, and the legacy `overdue`
   * status is reported as `pending` — there is no overdue state any more.
   */
  async listForUser(userId: string) {
    const fees = await this.prisma.listingFee.findMany({
      where: {
        userId,
        OR: [{ status: 'paid' }, OWED_LISTING_FEE_WHERE],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        listing: {
          select: {
            id: true,
            arabicTitle: true,
            category: true,
            deletedAt: true,
            sellerDeclaredSold: true,
          },
        },
      },
    });

    const rows = fees.map((f) => {
      const paid = f.status === 'paid';
      const saleKnown = f.saleAmount != null;
      return {
        id: f.id,
        listingId: f.listingId,
        price: f.price,
        saleAmount: f.saleAmount,
        // Unpaid without a declared sale amount: the commission is unknown until
        // the seller enters it (1% of the sale, never of the asking price).
        commission: paid || saleKnown ? f.commission : null,
        status: paid ? 'paid' : 'pending',
        owed: !paid,
        dueDate: null,
        paidAt: f.paidAt,
        transactionId: f.transactionId,
        createdAt: f.createdAt,
        listing: f.listing
          ? {
              arabicTitle: f.listing.arabicTitle,
              category: f.listing.category,
              deleted: Boolean(f.listing.deletedAt),
              sellerDeclaredSold: f.listing.sellerDeclaredSold,
            }
          : null,
      };
    });

    const owed = rows.filter((r) => r.owed);
    const owedTotal =
      Math.round(owed.reduce((sum, r) => sum + (Number(r.commission) || 0), 0) * 100) / 100;

    return {
      ratePercent: LISTING_COMMISSION_PERCENT,
      optional: true,
      summary: { owedCount: owed.length, owedTotal },
      fees: rows,
    };
  }

  async quoteForOwner(
    userId: string,
    listingId: string,
    saleAmountRaw: unknown,
  ) {
    const saleAmount = parsePositiveMoneyAmount(saleAmountRaw);
    if (saleAmount == null) {
      throwApi(400, 'invalid_sale_amount', 'أدخل مبلغ بيع صالحاً أكبر من صفر');
    }

    // Only pending/overdue fees are quotable (paid → fee_already_paid, same as
    // payment initiation). Legacy listings without a fee row get one created here.
    const flags = await this.paidServices.getFlags();
    const fee = await ensurePayableListingFee(this.prisma, {
      referenceId: listingId,
      userId,
      listingFeesEnabled: flags.listingFeesEnabled === true,
    });

    return {
      listingId: fee.listingId,
      feeId: fee.id,
      saleAmount,
      ratePercent: LISTING_COMMISSION_PERCENT,
      commission: calculateListingFeeAmount(saleAmount),
      status: fee.status,
    };
  }
}
