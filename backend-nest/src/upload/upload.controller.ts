import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { PresignUploadDto } from './dto/upload.dto';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @RateLimit('api')
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  async presign(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PresignUploadDto,
  ) {
    return successResponse(await this.upload.presign(user, dto));
  }

  @RateLimit('api')
  @Post('direct')
  @HttpCode(HttpStatus.OK)
  async direct(
    @CurrentUser() user: JwtPayload,
    @Query('folder') folder: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.upload.assertDirectUploadAvailable();
    return successResponse(
      await this.upload.uploadDirect(user, folder || 'temp', req, res),
    );
  }
}
