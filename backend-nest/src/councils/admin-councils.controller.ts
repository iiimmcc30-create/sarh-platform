import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Roles, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { AdminCouncilsService } from './admin-councils.service';

export class AdminCouncilsQueryDto {
  @IsOptional()
  @IsIn(['LIVE', 'ENDED', 'SCHEDULED'])
  status?: 'LIVE' | 'ENDED' | 'SCHEDULED';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  golden?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class AdminCouncilGoldenDto {
  @IsBoolean()
  golden!: boolean;
}

export class AdminCouncilCloseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/** `/api/admin/councils` — staff list/close, admin-only golden tier. */
@Controller('admin/councils')
export class AdminCouncilsController {
  constructor(private readonly admin: AdminCouncilsService) {}

  @Roles('ADMIN', 'MODERATOR')
  @RateLimit('api')
  @Get()
  async list(@Query() query: AdminCouncilsQueryDto) {
    return successResponse(await this.admin.list(query));
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Patch(':id/golden')
  async setGolden(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCouncilGoldenDto,
  ) {
    return successResponse(await this.admin.setGolden(actor, id, dto.golden));
  }

  @Roles('ADMIN', 'MODERATOR')
  @RateLimit('api')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCouncilCloseDto,
  ) {
    return successResponse(await this.admin.forceClose(actor, id, dto.reason));
  }
}
