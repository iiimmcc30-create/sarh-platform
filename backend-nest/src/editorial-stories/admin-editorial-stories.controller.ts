import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import {
  CreateEditorialStoryDto,
  UpdateEditorialStoryDto,
} from './dto/editorial-stories.dto';
import { EditorialStoriesService } from './editorial-stories.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/editorial-stories')
export class AdminEditorialStoriesController {
  constructor(private readonly stories: EditorialStoriesService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const stories = await this.stories.listAll();
    return successResponse({ stories });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEditorialStoryDto) {
    const story = await this.stories.create(dto);
    return successResponse({ story });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateEditorialStoryDto) {
    const story = await this.stories.update(id, dto);
    return successResponse({ story });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return successResponse(await this.stories.remove(id));
  }
}
