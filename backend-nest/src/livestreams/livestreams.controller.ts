import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MethodNotAllowedException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { LivestreamsService } from './livestreams.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  OptionalAuth,
  Public,
  RateLimit,
} from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type { CreateStreamBodyDto } from './dto/livestreams.dto';

@Controller('livestreams')
export class LivestreamsController {
  constructor(private readonly livestreams: LivestreamsService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    return successResponse(await this.livestreams.listStreams());
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateStreamBodyDto,
  ) {
    return successResponse(await this.livestreams.createStream(user, body));
  }

  @RateLimit('api')
  @Get('eligibility')
  @HttpCode(HttpStatus.OK)
  async eligibility(@CurrentUser() user: JwtPayload) {
    return successResponse(
      await this.livestreams.checkEligibility(user.userId),
    );
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getStream(
    @Param('id') id: string,
    @Query('action') action?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (action === 'token') {
      if (!user) throwApi(401, 'unauthorized', 'غير مصرح');
      return successResponse(await this.livestreams.getViewerToken(id, user));
    }

    if (action) {
      throw new MethodNotAllowedException();
    }

    return successResponse(await this.livestreams.getStream(id));
  }

  @RateLimit('api')
  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async mutateStream(
    @Param('id') id: string,
    @Query('action') action: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (action === 'start') {
      return successResponse(await this.livestreams.startStream(id, user));
    }
    if (action === 'end') {
      return successResponse(await this.livestreams.endStream(id, user));
    }
    throw new MethodNotAllowedException();
  }
}
