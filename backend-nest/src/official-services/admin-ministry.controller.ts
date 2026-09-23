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
  Put,
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import {
  CreateMinistryPostDto,
  UpdateMinistryPostDto,
  UpdateMinistryProfileDto,
} from './dto/official-services.dto';
import { OfficialServicesService } from './official-services.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/ministry')
export class AdminMinistryController {
  constructor(private readonly services: OfficialServicesService) {}

  @Roles(...STAFF)
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  async profile() {
    return successResponse({ account: await this.services.getAccount() });
  }

  @Roles('ADMIN')
  @Put('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Body() dto: UpdateMinistryProfileDto) {
    return successResponse({ account: await this.services.updateAccount(dto) });
  }

  @Roles(...STAFF)
  @Get('posts')
  @HttpCode(HttpStatus.OK)
  async posts() {
    return successResponse({ posts: await this.services.listMinistryPosts() });
  }

  @Roles('ADMIN')
  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  async createPost(@Body() dto: CreateMinistryPostDto) {
    return successResponse({
      post: await this.services.createMinistryPost(dto),
    });
  }

  @Roles('ADMIN')
  @Patch('posts/:id')
  @HttpCode(HttpStatus.OK)
  async updatePost(
    @Param('id') id: string,
    @Body() dto: UpdateMinistryPostDto,
  ) {
    return successResponse({
      post: await this.services.updateMinistryPost(id, dto),
    });
  }

  @Roles('ADMIN')
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  async removePost(@Param('id') id: string) {
    return successResponse(await this.services.removeMinistryPost(id));
  }
}
