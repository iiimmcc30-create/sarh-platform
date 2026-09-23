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
  Query,
} from '@nestjs/common';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ListThreadsQueryDto,
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
