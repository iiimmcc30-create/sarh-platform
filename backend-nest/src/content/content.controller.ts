import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Public, RateLimit, Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @RateLimit('api')
  @Get('sections')
  @HttpCode(HttpStatus.OK)
  async listSections() {
    const sections = await this.content.listPublicSections();
    return successResponse({ sections });
  }

  @Public()
  @RateLimit('api')
  @Get('sections/:slug')
  @HttpCode(HttpStatus.OK)
  async getSection(@Param('slug') slug: string) {
    const section = await this.content.getPublicSection(slug);
    if (!section) throw new NotFoundException('section_not_found');
    return successResponse({ section });
  }

  /** Staff helper: upsert the five Sarh policy documents if missing. */
  @Roles('ADMIN', 'MODERATOR')
  @RateLimit('api')
  @Post('seed-policies')
  @HttpCode(HttpStatus.OK)
  async seedPolicies() {
    const sections = await this.content.ensurePolicySeeds();
    return successResponse({ sections, seeded: true });
  }
}
