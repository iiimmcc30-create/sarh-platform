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
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { CreateButcherStoryDto } from './dto/stories.dto';
import { StoriesService } from './stories.service';

@Controller('butchers/stories')
export class ButcherStoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    return successResponse(await this.stories.getActiveButcherStories());
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateButcherStoryDto,
  ) {
    return successResponse(await this.stories.createButcherStory(user, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.stories.deleteButcherStory(user, id));
  }
}
