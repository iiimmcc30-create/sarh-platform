import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COMMISSION_TABLE } from '../lib/commissions';
import { throwApi } from '../common/exceptions/api.exception';
import { PaidServicesService } from '../settings/paid-services.service';
import { ensurePayableListingFee } from '../listings/listing-fee-ensure';
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

  async listForUser(userId: string) {
    const fees = await this.prisma.listingFee.findMany({
      where: { userId },
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

    return {
      ratePercent: LISTING_COMMISSION_PERCENT,
      fees: fees.map((f) => ({
        id: f.id,
        listingId: f.listingId,
        price: f.price,
        saleAmount: f.saleAmount,
        commission: f.commission,
        status: f.status,
        dueDate: f.dueDate,
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
      })),
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
