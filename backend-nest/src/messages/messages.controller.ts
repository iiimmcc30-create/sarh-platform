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
  ContactsQueryDto,
  ListThreadsQueryDto,
  MuteThreadDto,
  PinThreadDto,
  SendMessageDto,
  ThreadMessagesQueryDto,
} from './dto/messages.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async getThreads(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListThreadsQueryDto,
  ) {
    return successResponse(await this.messages.getThreads(user, query));
  }

  /** People the user can start a 1:1 with (following/followers/past chats + search). */
  @RateLimit('api')
  @Get('contacts')
  @HttpCode(HttpStatus.OK)
  async getContacts(
    @CurrentUser() user: JwtPayload,
    @Query() query: ContactsQueryDto,
  ) {
    return successResponse(await this.messages.getContacts(user, query));
  }

  /** Existing 1:1 conversation with a user (or null). Never tied to a listing. */
  @RateLimit('api')
  @Get('peer/:userId')
  @HttpCode(HttpStatus.OK)
  async getPeerConversation(
    @CurrentUser() user: JwtPayload,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return successResponse(
      await this.messages.getPeerConversation(user, userId),
    );
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async send(@CurrentUser() user: JwtPayload, @Body() dto: SendMessageDto) {
    return successResponse(await this.messages.sendMessage(user, dto));
  }

  @RateLimit('api')
  @Patch(':threadId/pin')
  @HttpCode(HttpStatus.OK)
  async pinThread(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Body() dto: PinThreadDto,
  ) {
    return successResponse(
      await this.messages.pinThread(user, threadId, dto.pinned),
    );
  }

  /** Mute / unmute push notifications for this conversation (caller only). */
  @RateLimit('api')
  @Patch(':threadId/mute')
  @HttpCode(HttpStatus.OK)
  async muteThread(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Body() dto: MuteThreadDto,
  ) {
    return successResponse(
      await this.messages.muteThread(user, threadId, dto.muted),
    );
  }

  @RateLimit('api')
  @Delete(':threadId')
  @HttpCode(HttpStatus.OK)
  async hideThread(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
  ) {
    return successResponse(await this.messages.hideThread(user, threadId));
  }

  @RateLimit('api')
  @Get(':threadId')
  @HttpCode(HttpStatus.OK)
  async getThreadMessages(
    @CurrentUser() user: JwtPayload,
    @Param('threadId') threadId: string,
    @Query() query: ThreadMessagesQueryDto,
  ) {
    return successResponse(
      await this.messages.getThreadMessages(user, threadId, query),
    );
  }
}
