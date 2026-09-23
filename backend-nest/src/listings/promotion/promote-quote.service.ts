import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  lookupPromotePrice,
  type PromoteCatalogGoal,
} from '../promote-catalog';
import {
  estimatePromotionReach,
  DEFAULT_REACH_FACTORS,
  type ReachFactors,
} from './reach-estimate.util';

export type PromoteGoal = PromoteCatalogGoal;

export type PromoteQuoteInput = {
  goal: PromoteGoal;
  durationHours: number;
  /** Ignored. Kept for API compatibility. */
  amount?: number;
};

export type PromoteQuoteResult = {
  goal: PromoteGoal;
  durationHours: number;
  amount: number;
  minimumAmount: number;
  currency: 'SAR';
  reachEstimate?: { min: number; max: number };
  pricingMode: 'catalog';
};

@Injectable()
export class PromoteQuoteService {
  constructor(private readonly prisma: PrismaService) {}

  private async getNumberSetting(
    key: string,
    fallback: number,
  ): Promise<number> {
    try {
      const s = await this.prisma.appSetting.findUnique({ where: { key } });
      if (s && typeof s.value === 'number' && s.value > 0) return s.value;
    } catch {
      /* fall through */
    }
    return fallback;
  }

  async getReachFactors(): Promise<ReachFactors> {
    const [budgetFactorMin, budgetFactorMax, hourFactorMin, hourFactorMax] =
      await Promise.all([
        this.getNumberSetting(
          'pricing.reach.budgetFactorMin',
          DEFAULT_REACH_FACTORS.budgetFactorMin,
        ),
        this.getNumberSetting(
          'pricing.reach.budgetFactorMax',
          DEFAULT_REACH_FACTORS.budgetFactorMax,
        ),
        this.getNumberSetting(
          'pricing.reach.hourFactorMin',
          DEFAULT_REACH_FACTORS.hourFactorMin,
        ),
        this.getNumberSetting(
          'pricing.reach.hourFactorMax',
          DEFAULT_REACH_FACTORS.hourFactorMax,
        ),
      ]);
    return { budgetFactorMin, budgetFactorMax, hourFactorMin, hourFactorMax };
  }

  async quote(input: PromoteQuoteInput): Promise<PromoteQuoteResult> {
    const priced = lookupPromotePrice(input.goal, {
      durationHours: input.durationHours,
    });
    if (!priced || priced.goal === 'both') {
      throwApi(400, 'invalid_duration', 'مدة أو هدف الترويج غير صالح');
    }

    const amount = priced.amount;
    const result: PromoteQuoteResult = {
      goal: priced.goal,
      durationHours: priced.durationHours,
      amount,
      minimumAmount: amount,
      currency: 'SAR',
      pricingMode: 'catalog',
    };

    if (priced.goal === 'visibility') {
      const factors = await this.getReachFactors();
      result.reachEstimate = estimatePromotionReach(
        amount,
        priced.durationHours,
        factors,
      );
    }

    return result;
  }
}
