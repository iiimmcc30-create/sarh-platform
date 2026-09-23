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
  CreateCommentDto,
  CreatePostDto,
  ListPostsQueryDto,
  UpdatePostDto,
} from './dto/posts.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @OptionalAuth()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async getFeed(
    @Query() query: ListPostsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.posts.getFeed(query, user));
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return successResponse(await this.posts.createPost(user, dto));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/comments')
  @HttpCode(HttpStatus.OK)
  async listComments(@Param('id') id: string) {
    return successResponse(await this.posts.listComments(id));
  }

  @RateLimit('api')
  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return successResponse(await this.posts.createComment(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return successResponse(await this.posts.deleteComment(user, id, commentId));
  }

  @RateLimit('api')
  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  async toggleLike(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.posts.toggleLike(user, id));
  }

  @RateLimit('api')
  @Post(':id/repost')
  @HttpCode(HttpStatus.OK)
  async toggleRepost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.posts.toggleRepost(user, id));
  }

  @RateLimit('api')
  @Post(':id/bookmark')
  @HttpCode(HttpStatus.OK)
  async toggleBookmark(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.posts.toggleBookmark(user, id));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  async recordView(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return successResponse(await this.posts.recordView(id, user));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return successResponse(await this.posts.getPost(id, user));
  }

  @RateLimit('api')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return successResponse(await this.posts.updatePost(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.posts.deletePost(user, id));
  }
}
