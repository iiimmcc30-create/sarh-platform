import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ListingFreeBoostService } from './listing-free-boost.service';

/** Weekly free boosts for Blue+ / Gold (no payment; quota checked server-side). */
@Controller('listings')
export class ListingFreeBoostController {
  constructor(private readonly freeBoosts: ListingFreeBoostService) {}

  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Get('boost/free-quota')
  @Header('Cache-Control', 'private, no-store')
  async quota(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.freeBoosts.getQuota(user));
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit('api')
  @Post(':listingId/boost/free')
  @HttpCode(HttpStatus.OK)
  async apply(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.freeBoosts.applyFreeBoost(user, listingId),
    );
  }
}
