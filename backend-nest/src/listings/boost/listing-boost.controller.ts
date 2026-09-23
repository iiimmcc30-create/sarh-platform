import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { BoostType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RateLimit, Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { ListingBoostService } from './listing-boost.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  PROMOTE_DURATION_HOURS_MAX,
  PROMOTE_DURATION_HOURS_MIN,
} from '../promotion/promotion-limits.config';

class InitiateBoostDto {
  @IsEnum(BoostType)
  boostType: BoostType;

  @IsOptional()
  @IsIn([1, 3])
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(PROMOTE_DURATION_HOURS_MIN)
  @Max(PROMOTE_DURATION_HOURS_MAX)
  durationHours?: number;

  /** Ignored by backend — price is always computed server-side. */
  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsIn(['visibility', 'pinned', 'featured'])
  promotionGoal?: 'visibility' | 'pinned' | 'featured';

  @IsString()
  method: string;
}

@Controller('listings')
export class ListingBoostController {
  constructor(private readonly boosts: ListingBoostService) {}

  /** Return available plans + pricing. */
  @Public()
  @RateLimit('api')
  @Get('boost/plans')
  getBoostPlans() {
    return successResponse(this.boosts.getBoostPlans());
  }

  /** Initiate a boost payment for a listing. */
  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Post(':listingId/boost')
  @HttpCode(HttpStatus.CREATED)
  async initiateBoost(
    @Param('listingId') listingId: string,
    @Body() dto: InitiateBoostDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.boosts.initiateBoost(user, listingId, {
      boostType: dto.boostType,
      durationDays: dto.durationDays,
      durationHours: dto.durationHours,
      amount: dto.amount,
      method: dto.method,
      promotionGoal: dto.promotionGoal,
    });
    return successResponse(result);
  }

  /** Dev-only: instantly complete a boost without going through NI. */
  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Post('boost/:boostId/dev-complete')
  @HttpCode(HttpStatus.OK)
  async devComplete(
    @Param('boostId') boostId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.boosts.devCompleteBoost(user, boostId);
    return successResponse(result);
  }

  /** Return all boosts for a given listing. */
  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Get(':listingId/boosts')
  async getBoosts(@Param('listingId') listingId: string) {
    return successResponse(await this.boosts.getListingBoosts(listingId));
  }
}
