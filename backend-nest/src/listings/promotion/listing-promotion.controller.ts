import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RateLimit, Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ListingPromotionService } from './listing-promotion.service';
import { PromoteQuoteService } from './promote-quote.service';
import type { PromotionTierKey } from './promotion-tiers.config';
import {
  PROMOTE_AMOUNT_MAX,
  PROMOTE_AMOUNT_MIN,
  PROMOTE_DURATION_HOURS_MAX,
  PROMOTE_DURATION_HOURS_MIN,
} from './promotion-limits.config';

class InitiatePromotionDto {
  @IsOptional()
  @IsIn([1, 2])
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(PROMOTE_DURATION_HOURS_MIN)
  @Max(PROMOTE_DURATION_HOURS_MAX)
  durationHours?: number;

  /** Ignored — server looks up the official catalog amount. */
  @IsOptional()
  @IsNumber()
  @Min(PROMOTE_AMOUNT_MIN)
  @Max(PROMOTE_AMOUNT_MAX)
  amount?: number;

  @IsOptional()
  @IsIn(['visibility', 'pinned', 'featured'])
  promotionGoal?: 'visibility' | 'pinned' | 'featured';

  @IsString()
  method: string;

  @IsOptional()
  @IsIn(['standard'])
  tier?: PromotionTierKey;
}

class TrackPromotionEventDto {
  @IsIn(['impression', 'click', 'view'])
  event: 'impression' | 'click' | 'view';
}

class PromoteQuoteQueryDto {
  @IsIn(['visibility', 'pinned', 'featured'])
  goal: 'visibility' | 'pinned' | 'featured';

  @Type(() => Number)
  @IsInt()
  @Min(PROMOTE_DURATION_HOURS_MIN)
  @Max(PROMOTE_DURATION_HOURS_MAX)
  durationHours: number;

  /** Optional: kept for API compatibility. Ignored by server for price calculation. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(PROMOTE_AMOUNT_MIN)
  @Max(PROMOTE_AMOUNT_MAX)
  amount?: number;
}

@Controller('listings')
export class ListingPromotionController {
  constructor(
    private readonly promotions: ListingPromotionService,
    private readonly promoteQuote: PromoteQuoteService,
  ) {}

  @Public()
  @RateLimit('api')
  @Get('promotion/plans')
  getPlans() {
    return successResponse(this.promotions.getPromotionPlans());
  }

  /** Price quote: server-side computed price for all goals. */
  @Public()
  @RateLimit('api')
  @Get('promote/quote')
  async getQuote(@Query() query: PromoteQuoteQueryDto) {
    return successResponse(
      await this.promoteQuote.quote({
        goal: query.goal,
        durationHours: Number(query.durationHours),
        amount: query.amount != null ? Number(query.amount) : undefined,
      }),
    );
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Post(':listingId/promotion')
  @HttpCode(HttpStatus.CREATED)
  async initiate(
    @Param('listingId') listingId: string,
    @Body() dto: InitiatePromotionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.promotions.initiatePromotion(user, listingId, {
        durationDays: dto.durationDays,
        durationHours: dto.durationHours,
        amount: dto.amount,
        method: dto.method,
        tier: dto.tier ?? 'standard',
        promotionGoal: dto.promotionGoal ?? 'visibility',
      }),
    );
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Get(':listingId/promotion/stats')
  async stats(
    @Param('listingId') listingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.promotions.getPromotionStats(user, listingId),
    );
  }

  @Public()
  @RateLimit('api')
  @Post(':listingId/promotion/track')
  @HttpCode(HttpStatus.OK)
  async track(
    @Param('listingId') listingId: string,
    @Body() dto: TrackPromotionEventDto,
  ) {
    return successResponse(
      await this.promotions.trackPromotionEvent(listingId, dto.event),
    );
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Post('promotion/:promotionId/dev-complete')
  @HttpCode(HttpStatus.OK)
  async devComplete(
    @Param('promotionId') promotionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.promotions.devCompletePromotion(user, promotionId),
    );
  }
}
