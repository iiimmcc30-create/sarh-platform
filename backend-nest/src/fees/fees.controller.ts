import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { successResponse } from '../common/utils/response.util';
import { FeesService } from './fees.service';
import { ListingFeeQuoteDto } from './dto/fees.dto';

@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  @RateLimit('api')
  @HttpCode(200)
  async listMine(@CurrentUser() user: JwtPayload) {
    const data = await this.fees.listForUser(user.userId);
    return successResponse(data);
  }

  @Post('quote')
  @RateLimit('api')
  @HttpCode(200)
  async quote(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ListingFeeQuoteDto,
  ) {
    return successResponse(
      await this.fees.quoteForOwner(user.userId, dto.listingId, dto.saleAmount),
    );
  }

  @Public()
  @Get('rules')
  @HttpCode(200)
  getRules() {
    return successResponse(this.fees.getRules());
  }
}
