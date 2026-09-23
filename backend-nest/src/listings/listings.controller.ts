import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OptionalAuth, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ApplyPlanPromoteDto,
  CreateListingDto,
  CreateListingCommentDto,
  DeleteListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './dto/listings.dto';
import { ListingsService } from './listings.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @OptionalAuth()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Query() query: ListListingsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.listings.list(query, user?.userId));
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateListingDto) {
    return successResponse(await this.listings.create(user, dto));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/comments')
  @HttpCode(HttpStatus.OK)
  async listComments(@Param('id') id: string) {
    return successResponse(await this.listings.listComments(id));
  }

  @RateLimit('api')
  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateListingCommentDto,
  ) {
    return successResponse(await this.listings.createComment(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return successResponse(
      await this.listings.deleteComment(user, id, commentId),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    return successResponse(await this.listings.getById(id));
  }

  @RateLimit('api')
  @Post(':id/plan-promote')
  @HttpCode(HttpStatus.OK)
  async applyPlanPromotion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ApplyPlanPromoteDto,
  ) {
    return successResponse(
      await this.listings.applyPlanPromotion(user, id, dto),
    );
  }

  @RateLimit('api')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return successResponse(await this.listings.update(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DeleteListingDto,
  ) {
    return successResponse(await this.listings.remove(user, id, dto));
  }
}
