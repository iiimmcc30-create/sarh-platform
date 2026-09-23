import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AuthRepository } from '../../auth/repositories/auth.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi, ApiException } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import { normalizeE164Phone } from '../../lib/phone';
import { UploadService } from '../../upload/upload.service';
import { ApplicationRepository } from '../repositories/application.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { TransactionService } from './transaction.service';
import { appendTimelineEvent } from '../helpers/timeline';
import { assertUserHasNoButcher } from '../helpers/transaction';
import {
  assertTransition,
  timelineActionForTransition,
} from '../helpers/stateTransitions';
import {
  validateRequiredDocuments,
  validateSubmitSnapshot,
  validateDocumentUploadInput,
  assertFileKeyOwnedByUser,
  isUniqueRequiredDocumentType,
} from '../helpers/validation';
import { validateSnapshotFormat } from '../helpers/snapshotValidation';
import {
  prepareStoredButcherAccountCredentials,
  assertAccountCredentialsAvailable,
} from '../helpers/accountCredentials';
import {
  assertJoinFileAcceptable,
  assertRequiredJoinFiles,
  type JoinFilePart,
} from '../helpers/joinFiles';
import { toApplicationDetail } from '../mappers';
import {
  ButcherApplicationError,
  mapPrismaUniqueViolation,
  isButcherApplicationError,
} from '../errors';
import { ButcherApplicationNotificationsService } from './butcher-application-notifications.service';
import type { PublicJoinBody } from '../routes/publicJoin.schema';
import type { ApplicationSnapshotInput, DocumentUploadInput } from '../types';

function snapshotFromJoin(body: PublicJoinBody): ApplicationSnapshotInput {
  return {
    nameAr: body.nameAr,
    nameEn: body.nameEn,
    shopPhone: body.shopPhone,
    commercialReg: body.commercialReg,
    country: body.country,
    city: body.city,
    cityAr: body.cityAr,
    address: body.address,
    addressAr: body.addressAr,
    lat: body.lat,
    lng: body.lng,
    bioAr: body.bioAr,
    bioEn: body.bioEn,
    specialties: body.specialties,
    openTime: body.openTime,
    closeTime: body.closeTime,
  };
}

@Injectable()
export class PublicButcherJoinService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly documents: DocumentRepository,
    private readonly transactions: TransactionService,
    private readonly authRepo: AuthRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly applicationNotifications: ButcherApplicationNotificationsService,
    private readonly uploads: UploadService,
    private readonly logger: LoggerService,
  ) {}

  async submitJoin(body: PublicJoinBody, files: JoinFilePart[] = []) {
    const phone = normalizeE164Phone(body.phone);
    this.assertPhoneToken(body.phone_token, phone);
    validateSnapshotFormat(snapshotFromJoin(body));
    assertRequiredJoinFiles(files);
    for (const part of files) assertJoinFileAcceptable(part);

    const account = await prepareStoredButcherAccountCredentials({
      accountUsername: body.accountUsername,
      accountEmail: body.accountEmail,
      password: body.accountPassword,
      confirmPassword: body.accountPasswordConfirm,
    });
    if (
      body.username &&
      body.username.trim().toLowerCase() === account.accountUsername
    ) {
      throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_TAKEN', {
        field: 'accountUsername',
      });
    }
    await assertAccountCredentialsAvailable(this.prisma, {
      accountUsername: account.accountUsername,
      accountEmail: account.accountEmail,
      shopPhone: body.shopPhone,
    });

    const existingUser = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: {
        id: true,
        username: true,
        role: true,
        isAI: true,
        butcherProfile: { select: { id: true } },
      },
    });

    if (existingUser?.isAI) {
      throwApi(403, 'ai_account', 'لا يمكن تقديم طلب انضمام من هذا الحساب');
    }
    if (existingUser?.butcherProfile) {
      throw new ButcherApplicationError('BUTCHER_ALREADY_EXISTS');
    }

    let userId = existingUser?.id;
    if (!userId) {
      userId = await this.createJoinUser(body, phone);
    }

    const uploadedDocs: DocumentUploadInput[] = [];
    for (const part of files) {
      const stored = await this.uploads.uploadOwnedButcherApplicationFile(
        userId,
        part,
      );
      uploadedDocs.push({
        type: part.type,
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        originalFileName: stored.originalFileName,
      });
    }

    try {
      const result = await this.transactions.runInTransaction(async (tx) => {
        await assertUserHasNoButcher(tx, userId!);
        await assertAccountCredentialsAvailable(tx, {
          accountUsername: account.accountUsername,
          accountEmail: account.accountEmail,
          shopPhone: body.shopPhone,
        });

        const submitted =
          await this.applications.findActiveApplicationByUserAndStatus(
            tx,
            userId!,
            'SUBMITTED',
          );
        if (submitted) {
          throw new ButcherApplicationError('ACTIVE_SUBMITTED_EXISTS');
        }

        const snapshot = snapshotFromJoin(body);
        let applicationId: string;
        let created = false;

        const draft =
          await this.applications.findActiveApplicationByUserAndStatus(
            tx,
            userId!,
            'DRAFT',
          );

        if (draft) {
          await this.applications.updateApplicationSnapshot(
            tx,
            draft.id,
            snapshot,
          );
          applicationId = draft.id;
        } else {
          const createdApp = await this.applications.createApplication(
            tx,
            userId!,
            snapshot,
          );
          applicationId = createdApp.id;
          created = true;
          await appendTimelineEvent(tx, {
            applicationId,
            action: 'CREATE',
            createdBy: userId!,
            metadata: { source: 'public_join' },
          });
        }

        for (const input of uploadedDocs) {
          validateDocumentUploadInput(input);
          assertFileKeyOwnedByUser(input.fileKey, userId!);
          if (isUniqueRequiredDocumentType(input.type)) {
            const existingDoc =
              await this.documents.findDocumentByApplicationAndType(
                applicationId,
                input.type,
                tx,
              );
            if (existingDoc) {
              await this.documents.replaceDocument(tx, existingDoc.id, {
                fileKey: input.fileKey,
                mimeType: input.mimeType,
                fileSizeBytes: input.fileSizeBytes,
                originalFileName: input.originalFileName,
              });
              continue;
            }
          }
          await this.documents.createDocument(tx, applicationId, input);
        }

        const existing = await this.applications.getApplicationByIdOrThrow(
          applicationId,
          tx,
        );
        assertTransition(existing.status, 'SUBMITTED');
        validateSubmitSnapshot(existing);
        validateRequiredDocuments(existing);

        const now = new Date();
        const updated = await this.applications.updateApplicationStatus(
          tx,
          applicationId,
          {
            status: 'SUBMITTED',
            submittedAt: now,
            acceptedTermsAt: now,
            accountUsername: account.accountUsername,
            accountEmail: account.accountEmail,
            accountPasswordHash: account.accountPasswordHash,
          },
        );

        await appendTimelineEvent(tx, {
          applicationId,
          action: timelineActionForTransition('SUBMITTED'),
          createdBy: userId!,
          metadata: {
            source: 'public_join',
            reusedDraft: !created,
          },
        });

        return toApplicationDetail(updated);
      });

      void this.applicationNotifications
        .notifyAfterApplicationSubmit(result, userId)
        .catch((err) =>
          this.logger.warn(
            { err, userId },
            'Public join submit notification failed',
          ),
        );

      this.logger.info(
        {
          userId,
          applicationId: result.id,
          applicationNumber: result.applicationNumber,
        },
        'Public butcher join submitted',
      );

      return {
        id: result.id,
        applicationNumber: result.applicationNumber,
        status: result.status,
        nameAr: result.nameAr,
        submittedAt: result.submittedAt,
      };
    } catch (err) {
      const mapped = mapPrismaUniqueViolation(err);
      if (mapped) throw mapped;
      if (isButcherApplicationError(err)) throw err;
      throw err;
    }
  }

  private assertPhoneToken(token: string, phone: string): void {
    try {
      const decoded = jwt.verify(
        token,
        this.config.get<string>('JWT_SECRET')!,
      ) as { phone?: string; verified?: boolean; purpose?: string };
      if (!decoded.verified || decoded.phone !== phone) {
        throwApi(
          400,
          'invalid_phone_token',
          'رمز تحقق الجوال غير صحيح أو لا يطابق رقم الجوال',
        );
      }
      if (
        decoded.purpose &&
        decoded.purpose !== 'join' &&
        decoded.purpose !== 'login'
      ) {
        throwApi(
          400,
          'invalid_phone_token',
          'رمز تحقق الجوال غير صالح لهذه العملية',
        );
      }
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throwApi(
        400,
        'invalid_phone_token',
        'رمز تحقق الجوال منتهي الصلاحية أو غير صحيح',
      );
    }
  }

  private async createJoinUser(
    body: PublicJoinBody,
    phone: string,
  ): Promise<string> {
    const username = body.username?.trim();
    if (!username) {
      throwApi(400, 'username_required', 'اسم المستخدم مطلوب لإنشاء الحساب');
    }

    const orConditions: Prisma.UserWhereInput[] = [{ username }, { phone }];
    if (body.email) orConditions.push({ email: body.email });
    const exists = await this.authRepo.findExistingUser(orConditions);
    if (exists) {
      if (exists.username === username)
        throwApi(409, 'username_taken', 'اسم المستخدم مستخدم بالفعل');
      if (exists.phone === phone)
        throwApi(409, 'phone_taken', 'رقم الجوال مسجّل بالفعل');
      if (body.email && exists.email === body.email)
        throwApi(409, 'email_taken', 'البريد الإلكتروني مستخدم بالفعل');
    }

    let passwordHash: string;
    if (body.password) {
      passwordHash = await bcrypt.hash(body.password, 12);
    } else {
      const randomPassword =
        Math.random().toString(36).slice(-8) + Date.now().toString(36);
      passwordHash = await bcrypt.hash(randomPassword, 12);
    }

    const user = await this.authRepo.createUser({
      username,
      displayName: body.displayName,
      arabicName: body.arabicName ?? body.displayName,
      country: body.country ?? 'SA',
      phone,
      email: body.email ?? null,
      googleId: null,
      avatar: null,
      passwordHash,
      verified: false,
    });
    await this.authRepo.followKnowledgeCenter(user.id).catch(() => undefined);
    return user.id;
  }
}
