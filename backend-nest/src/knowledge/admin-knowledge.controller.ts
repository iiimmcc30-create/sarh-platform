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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { KnowledgeCenterService } from './services/knowledge-center.service';
import {
  CreateKnowledgePostDto,
  CreateKnowledgeSourceDto,
  ListKnowledgeArticlesQueryDto,
  ListKnowledgeLogsQueryDto,
  UpdateKnowledgeProfileDto,
  UpdateKnowledgeSourceDto,
} from './dto/knowledge.dto';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@ApiTags('Admin Knowledge Center')
@ApiBearerAuth()
@Controller('admin/knowledge')
export class AdminKnowledgeController {
  constructor(private readonly knowledge: KnowledgeCenterService) {}

  @Roles(...STAFF)
  @Get('sources')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List knowledge sources' })
  async listSources() {
    return successResponse({ sources: await this.knowledge.listSources() });
  }

  @Roles('ADMIN')
  @Post('sources')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create knowledge source' })
  async createSource(@Body() body: CreateKnowledgeSourceDto) {
    return successResponse({ source: await this.knowledge.createSource(body) });
  }

  @Roles('ADMIN')
  @Patch('sources/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update knowledge source' })
  async updateSource(
    @Param('id') id: string,
    @Body() body: UpdateKnowledgeSourceDto,
  ) {
    return successResponse({
      source: await this.knowledge.updateSource(id, body),
    });
  }

  @Roles('ADMIN')
  @Delete('sources/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete knowledge source' })
  async deleteSource(@Param('id') id: string) {
    return successResponse(await this.knowledge.deleteSource(id));
  }

  @Roles('ADMIN')
  @Post('sources/:id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable knowledge source' })
  async disableSource(@Param('id') id: string) {
    return successResponse({
      source: await this.knowledge.setSourceEnabled(id, false),
    });
  }

  @Roles('ADMIN')
  @Post('sources/:id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable knowledge source' })
  async enableSource(@Param('id') id: string) {
    return successResponse({
      source: await this.knowledge.setSourceEnabled(id, true),
    });
  }

  @Roles('ADMIN')
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activate Knowledge Center account: ensure AI user, seed sources, auto-follow users, sync',
  })
  async activate(@Body() body?: { sync?: boolean }) {
    return successResponse(
      await this.knowledge.activateAccount({ sync: body?.sync !== false }),
    );
  }

  @Roles(...STAFF)
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-sync all enabled sources' })
  async syncAll() {
    return successResponse(await this.knowledge.syncAll());
  }

  @Roles(...STAFF)
  @Post('sources/:id/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-sync a single source' })
  async syncSource(@Param('id') id: string) {
    return successResponse(await this.knowledge.syncAll({ sourceId: id }));
  }

  @Roles(...STAFF)
  @Get('articles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List knowledge articles' })
  async listArticles(@Query() query: ListKnowledgeArticlesQueryDto) {
    return successResponse(await this.knowledge.listArticles(query));
  }

  @Roles(...STAFF)
  @Post('articles/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve and publish article' })
  async approve(@Param('id') id: string) {
    return successResponse({
      article: await this.knowledge.approveArticle(id),
    });
  }

  @Roles(...STAFF)
  @Post('articles/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject article' })
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return successResponse({
      article: await this.knowledge.rejectArticle(id, body?.reason),
    });
  }

  @Roles(...STAFF)
  @Post('articles/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually summarize (if needed) and publish' })
  async publishManual(@Param('id') id: string) {
    return successResponse({
      article: await this.knowledge.publishManual(id),
    });
  }

  @Roles(...STAFF)
  @Get('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List recent sync operation logs' })
  async logs(@Query() query: ListKnowledgeLogsQueryDto) {
    return successResponse(await this.knowledge.listLogs(query));
  }

  @Roles(...STAFF)
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Knowledge Center user profile' })
  async getProfile() {
    return successResponse({ user: await this.knowledge.getProfile() });
  }

  @Roles('ADMIN')
  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update Knowledge Center avatar and/or bio' })
  async updateProfile(@Body() body: UpdateKnowledgeProfileDto) {
    return successResponse({ user: await this.knowledge.updateProfile(body) });
  }

  @Roles(...STAFF)
  @Post('post')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a direct post as مركز المعرفة' })
  async createPost(@Body() body: CreateKnowledgePostDto) {
    return successResponse({
      post: await this.knowledge.createDirectPost(body),
    });
  }
}
