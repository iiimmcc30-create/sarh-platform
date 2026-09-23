import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COMMISSION_TABLE } from '../lib/commissions';
import { throwApi } from '../common/exceptions/api.exception';
import {
  calculateListingFeeAmount,
  LISTING_COMMISSION_PERCENT,
  parsePositiveMoneyAmount,
} from '../listings/listing-fee';

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const fee = await this.prisma.listingFee.findFirst({
      where: { listingId, userId },
      select: { id: true, status: true, listingId: true },
    });
    if (!fee) {
      throwApi(404, 'fee_not_found', 'لا توجد رسوم إعلان مرتبطة بهذا الإعلان');
    }

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
