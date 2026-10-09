import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { successResponse } from '../common/utils/response.util';
import { ConsentService } from './consent.service';
import { PRIVACY_POLICY_VERSION } from './privacy-policy';

export class AcceptPrivacyDto {
  /** The version the user saw; must be the current one. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  policyVersion?: string;
}

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly consent: ConsentService) {}

  /** GET /api/privacy/consent — has the user accepted the current policy? */
  @RateLimit('api')
  @Get('consent')
  async status(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.consent.status(user.userId));
  }

  /** POST /api/privacy/consent — accept the current privacy policy version. */
  @RateLimit('api')
  @Post('consent')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AcceptPrivacyDto,
    @Req() req: Request,
  ) {
    if (dto.policyVersion && dto.policyVersion !== PRIVACY_POLICY_VERSION) {
      throwApi(
        409,
        'policy_outdated',
        'تم تحديث سياسة الخصوصية، راجعها مجدداً',
      );
    }
    await this.consent.record(user.userId, 'policy_update', req);
    return successResponse(await this.consent.status(user.userId));
  }
}
