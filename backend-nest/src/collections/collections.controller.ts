import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OptionalAuth, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  AddCollectionMemberDto,
  CollectionsPageQueryDto,
  CreateCollectionDto,
  SearchCollectionUsersQueryDto,
  SearchCollectionsQueryDto,
  UpdateCollectionDto,
} from './dto/collections.dto';
import { CollectionsService } from './collections.service';

/**
 * «المجموعات». Static routes are declared before `:id`. Reads are public (optional
 * auth personalizes follow state and applies the viewer's blocks); every write needs
 * auth and management is owner-only (enforced in the service).
 */
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCollectionDto,
  ) {
    return successResponse(await this.collections.create(user, dto));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get('suggested')
  async suggested(
    @Query() query: CollectionsPageQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.collections.suggested(query.cursor, user),
    );
  }

  @RateLimit('api')
  @Get('mine')
  async mine(
    @CurrentUser() user: JwtPayload,
    @Query() query: CollectionsPageQueryDto,
  ) {
    return successResponse(await this.collections.mine(user, query.cursor));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get('search')
  async search(
    @Query() query: SearchCollectionsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.collections.search(query.q, query.cursor, user),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get('member-of/:userId')
  async memberOf(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: CollectionsPageQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.collections.memberOf(userId, query.cursor, user),
    );
  }

  @RateLimit('api')
  @Get('users/search')
  async searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: SearchCollectionUsersQueryDto,
  ) {
    return successResponse(
      await this.collections.searchUsers(user, query.q, query.collectionId),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.collections.detail(id, user));
  }

  @RateLimit('api')
  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return successResponse(await this.collections.update(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.collections.remove(user, id));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/feed')
  async feed(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CollectionsPageQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.collections.feed(id, query.cursor, user));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/members')
  async listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CollectionsPageQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.collections.listMembers(id, query.cursor, user),
    );
  }

  @RateLimit('api')
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCollectionMemberDto,
  ) {
    return successResponse(await this.collections.addMember(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return successResponse(
      await this.collections.removeMember(user, id, userId),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/followers')
  async listFollowers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CollectionsPageQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.collections.listFollowers(id, query.cursor, user),
    );
  }

  @RateLimit('api')
  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  async follow(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.collections.follow(user, id));
  }

  @RateLimit('api')
  @Delete(':id/follow')
  async unfollow(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.collections.unfollow(user, id));
  }

  @RateLimit('api')
  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.collections.block(user, id));
  }

  @RateLimit('api')
  @Delete(':id/block')
  async unblock(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.collections.unblock(user, id));
  }
}
