import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ButcherApplicationUserService } from './services/application.service';
import { ButcherApplicationDocumentService } from './services/document.service';
import { PublicButcherJoinService } from './services/public-join.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type {
  CreateApplicationBodyDto,
  DocumentReplaceBodyDto,
  DocumentUploadBodyDto,
  ListApplicationsQueryDto,
  SubmitApplicationBodyDto,
  UpdateApplicationBodyDto,
  WithdrawApplicationBodyDto,
} from './dto/butcher-applications.dto';
import {
  parseApplicationId,
  parseDocumentId,
  parseIfUnmodifiedSinceHeader,
} from './routes/parseRequest';
import {
  listQuerySchema,
  snapshotSchema,
  documentUploadBodySchema,
  documentReplaceBodySchema,
  submitBodySchema,
  withdrawBodySchema,
} from './routes/schemas';
import { publicJoinBodySchema } from './routes/publicJoin.schema';
import { flattenJoinFiles, type JoinUploadedFiles } from './helpers/joinFiles';
import { MAX_SHOP_PHOTO_FILE_BYTES } from './constants';

@Controller('butcher-applications')
export class ButcherApplicationsController {
  constructor(
    private readonly applications: ButcherApplicationUserService,
    private readonly documents: ButcherApplicationDocumentService,
    private readonly publicJoin: PublicButcherJoinService,
  ) {}

  @Public()
  @RateLimit('auth')
  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'commercial_license', maxCount: 1 },
        { name: 'national_id', maxCount: 1 },
        { name: 'municipal_permit', maxCount: 1 },
        { name: 'shop_photo', maxCount: 1 },
        { name: 'other', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: MAX_SHOP_PHOTO_FILE_BYTES },
      },
    ),
  )
  async submitPublicJoin(
    @Body() body: unknown,
    @UploadedFiles() files?: JoinUploadedFiles,
  ) {
    const parsed = publicJoinBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const application = await this.publicJoin.submitJoin(
      parsed.data,
      flattenJoinFiles(files),
    );
    return successResponse(application);
  }

  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApplicationsQueryDto,
  ) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const page = await this.applications.listApplications(
      user.userId,
      parsed.data,
    );
    return successResponse({
      applications: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  }

  @RateLimit('api')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDraft(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateApplicationBodyDto,
  ) {
    const parsed = snapshotSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const application = await this.applications.createDraft(
      user.userId,
      parsed.data,
    );
    return successResponse(application);
  }

  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getApplication(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const applicationId = parseApplicationId({ id });
    if (!applicationId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const application = await this.applications.getApplication(
      user.userId,
      applicationId,
    );
    return successResponse(application);
  }

  @RateLimit('api')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateDraft(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateApplicationBodyDto,
    @Headers('if-unmodified-since') ifUnmodifiedSinceHeader?: string,
  ) {
    const applicationId = parseApplicationId({ id });
    if (!applicationId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const parsed = snapshotSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const ifUnmodifiedSince = parseIfUnmodifiedSinceHeader(
      ifUnmodifiedSinceHeader,
    );
    if (ifUnmodifiedSince === null) {
      throwApi(400, 'validation_error', 'بيانات غير صحيحة', {
        fieldErrors: { 'If-Unmodified-Since': ['Invalid date format'] },
      });
    }

    const application = await this.applications.updateDraft(
      user.userId,
      applicationId,
      parsed.data,
      ifUnmodifiedSince,
    );
    return successResponse(application);
  }

  @RateLimit('api')
  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: DocumentUploadBodyDto,
  ) {
    const applicationId = parseApplicationId({ id });
    if (!applicationId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const parsed = documentUploadBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const document = await this.documents.uploadDocument(
      user.userId,
      applicationId,
      parsed.data,
    );
    return successResponse(document);
  }

  @RateLimit('api')
  @Patch(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  async replaceDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('documentId') documentIdParam: string,
    @Body() body: DocumentReplaceBodyDto,
  ) {
    const applicationId = parseApplicationId({ id });
    const documentId = parseDocumentId({ documentId: documentIdParam });
    if (!applicationId || !documentId) {
      throwApi(400, 'invalid_id', 'معرّف غير صحيح');
    }

    const parsed = documentReplaceBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const document = await this.documents.replaceDocument(
      user.userId,
      applicationId,
      documentId,
      parsed.data,
    );
    return successResponse(document);
  }

  @RateLimit('api')
  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('documentId') documentIdParam: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const applicationId = parseApplicationId({ id });
    const documentId = parseDocumentId({ documentId: documentIdParam });
    if (!applicationId || !documentId) {
      throwApi(400, 'invalid_id', 'معرّف غير صالح');
    }

    await this.documents.deleteDocument(user.userId, applicationId, documentId);
    res.status(204);
  }

  @RateLimit('api')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submitApplication(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: SubmitApplicationBodyDto,
  ) {
    const applicationId = parseApplicationId({ id });
    if (!applicationId) throwApi(400, 'invalid_id', 'معرّف غير صحيح');

    const parsed = submitBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const application = await this.applications.submitApplication(
      user.userId,
      applicationId,
      parsed.data,
    );
    return successResponse(application);
  }

  @RateLimit('api')
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawApplication(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: WithdrawApplicationBodyDto,
  ) {
    const applicationId = parseApplicationId({ id });
    if (!applicationId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const parsed = withdrawBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const application = await this.applications.withdrawApplication(
      user.userId,
      applicationId,
      parsed.data,
    );
    return successResponse(application);
  }
}
