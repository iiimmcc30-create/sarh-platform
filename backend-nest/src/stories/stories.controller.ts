import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalAuth, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CreateStoryDto,
  StoryReactionDto,
  StoryReplyDto,
} from './dto/stories.dto';
import { StoriesService } from './stories.service';

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @OptionalAuth()
  @RateLimit('api')
  @Get('feed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stories feed grouped by user (seen/unseen)' })
  @ApiBearerAuth()
  async feed(@CurrentUser() user?: JwtPayload) {
    return successResponse(await this.stories.getFeed(user));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Active stories (flat list, legacy-compatible)' })
  async list(@CurrentUser() user?: JwtPayload) {
    return successResponse(await this.stories.getActiveStories(user));
  }

  @RateLimit('api')
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user active stories' })
  async myStories(@CurrentUser() user: JwtPayload) {
    return successResponse(
      await this.stories.getUserStories(user.userId, user),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Active stories for a user' })
  async userStories(
    @Param('userId') userId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.stories.getUserStories(userId, user));
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a story' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStoryDto) {
    return successResponse(await this.stories.createStory(user, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own story' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.stories.deleteStory(user, id));
  }

  @RateLimit('api')
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record a unique story view' })
  async view(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.stories.recordView(user, id));
  }

  @RateLimit('api')
  @Get(':id/viewers')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List viewers (owner only)' })
  async viewers(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.stories.getViewers(user, id));
  }

  @RateLimit('api')
  @Post(':id/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add or change reaction' })
  async react(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: StoryReactionDto,
  ) {
    return successResponse(await this.stories.setReaction(user, id, dto));
  }

  @RateLimit('api')
  @Delete(':id/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove reaction' })
  async unreact(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.stories.removeReaction(user, id));
  }

  @RateLimit('api')
  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Private reply via chat message' })
  async reply(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: StoryReplyDto,
  ) {
    return successResponse(await this.stories.replyToStory(user, id, dto));
  }
}
