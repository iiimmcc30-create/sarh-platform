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
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CouncilAccessQueryDto,
  CouncilMemberActionDto,
  CouncilMicDto,
  CouncilsPageQueryDto,
  CreateCouncilDto,
  InviteCouncilUsersDto,
  JoinCouncilDto,
  SearchCouncilUsersQueryDto,
  UpdateCouncilDto,
} from './dto/councils.dto';
import { CouncilsService } from './councils.service';

/**
 * «المجالس» (Voice Councils). Every route needs auth; roles, seats, bans, mutes and
 * Agora roles are decided here on the server. Static routes come before `:id`.
 */
@Controller('councils')
export class CouncilsController {
  constructor(private readonly councils: CouncilsService) {}

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCouncilDto) {
    return successResponse(await this.councils.create(user, dto));
  }

  @RateLimit('api')
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: CouncilsPageQueryDto,
  ) {
    return successResponse(await this.councils.list(user, query.cursor));
  }

  @RateLimit('api')
  @Get('accessible')
  async accessible(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.councils.accessible(user));
  }

  @RateLimit('api')
  @Get('users/search')
  async searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: SearchCouncilUsersQueryDto,
  ) {
    return successResponse(await this.councils.searchUsers(user, query.q));
  }

  @RateLimit('api')
  @Get('invite/:code')
  async resolveInvite(
    @CurrentUser() user: JwtPayload,
    @Param() params: CouncilAccessQueryDto,
  ) {
    return successResponse(
      await this.councils.resolveInvite(user, params.code ?? ''),
    );
  }

  @RateLimit('api')
  @Get(':id')
  async detail(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CouncilAccessQueryDto,
  ) {
    return successResponse(await this.councils.getState(user, id, query.code));
  }

  @RateLimit('api')
  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouncilDto,
  ) {
    return successResponse(await this.councils.update(user, id, dto));
  }

  @RateLimit('api')
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JoinCouncilDto,
  ) {
    return successResponse(await this.councils.join(user, id, dto));
  }

  @RateLimit('api')
  @Post(':id/token')
  @HttpCode(HttpStatus.OK)
  async token(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.token(user, id));
  }

  @RateLimit('api')
  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  async leave(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.leave(user, id));
  }

  @RateLimit('api')
  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  async end(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.end(user, id));
  }

  @RateLimit('api')
  @Post(':id/mic')
  @HttpCode(HttpStatus.OK)
  async mic(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CouncilMicDto,
  ) {
    return successResponse(await this.councils.setMic(user, id, dto.muted));
  }

  @RateLimit('api')
  @Post(':id/stage/leave')
  @HttpCode(HttpStatus.OK)
  async leaveStage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.leaveStage(user, id));
  }

  @RateLimit('api')
  @Post(':id/requests')
  @HttpCode(HttpStatus.CREATED)
  async request(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.requestToSpeak(user, id));
  }

  @RateLimit('api')
  @Delete(':id/requests/mine')
  async cancelRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.cancelRequest(user, id));
  }

  @RateLimit('api')
  @Post(':id/requests/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return successResponse(
      await this.councils.decideRequest(user, id, requestId, true),
    );
  }

  @RateLimit('api')
  @Post(':id/requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return successResponse(
      await this.councils.decideRequest(user, id, requestId, false),
    );
  }

  @RateLimit('api')
  @Post(':id/members/:userId/actions')
  @HttpCode(HttpStatus.OK)
  async memberAction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CouncilMemberActionDto,
  ) {
    return successResponse(
      await this.councils.memberAction(user, id, userId, dto.action),
    );
  }

  @RateLimit('api')
  @Get(':id/banned')
  async banned(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.banned(user, id));
  }

  @RateLimit('api')
  @Post(':id/invites')
  @HttpCode(HttpStatus.OK)
  async invite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteCouncilUsersDto,
  ) {
    return successResponse(await this.councils.invite(user, id, dto.userIds));
  }

  @RateLimit('api')
  @Post(':id/invite-code/rotate')
  @HttpCode(HttpStatus.OK)
  async rotateInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(await this.councils.rotateInvite(user, id));
  }
}
