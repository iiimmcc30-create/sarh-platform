import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RateLimit, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AdminReviewsQueryDto, HideUserReviewDto } from './user-reviews.dto';
import { UserReviewsService } from './user-reviews.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/reviews')
export class AdminUserReviewsController {
  constructor(private readonly reviews: UserReviewsService) {}

  @Roles(...STAFF)
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query() query: AdminReviewsQueryDto) {
    return successResponse(await this.reviews.adminList(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async get(@Param('id') id: string) {
    return successResponse(await this.reviews.adminGet(id));
  }

  /** Soft-hide only. There is no delete route — the row stays for the audit log. */
  @Roles(...STAFF)
  @RateLimit('api')
  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  async hide(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: HideUserReviewDto,
  ) {
    return successResponse(await this.reviews.adminHide(id, actor, dto.reason));
  }
}
