import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  OptionalAuth,
  Public,
  RateLimit,
} from '../../common/decorators/auth.decorators';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  CreateUserReviewDto,
  ListUserReviewsQueryDto,
  ReportUserReviewDto,
} from './user-reviews.dto';
import { UserReviewsService } from './user-reviews.service';

@Controller('users')
export class UserReviewsController {
  constructor(private readonly reviews: UserReviewsService) {}

  @Public()
  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/reviews')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async list(
    @Param('id') id: string,
    @Query() query: ListUserReviewsQueryDto,
    @CurrentUser() viewer?: JwtPayload,
  ) {
    return successResponse(
      await this.reviews.list(id, query.cursor, query.limit, viewer),
    );
  }

  @RateLimit('api')
  @Post(':id/reviews')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUserReviewDto,
  ) {
    return successResponse(await this.reviews.create(id, user.userId, dto));
  }

  @RateLimit('api')
  @Post(':id/reviews/:reviewId/report')
  @HttpCode(HttpStatus.CREATED)
  async report(
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReportUserReviewDto,
  ) {
    return successResponse(await this.reviews.report(id, reviewId, user, dto));
  }
}
