import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { EditorialStoriesService } from './editorial-stories.service';

@Controller('editorial-stories')
export class EditorialStoriesController {
  constructor(private readonly stories: EditorialStoriesService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const stories = await this.stories.listPublic();
    return successResponse({ stories });
  }
}
