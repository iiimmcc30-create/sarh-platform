import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { SupportRepository } from '../repositories/support.repository';
import { SupportNotificationsService } from './support-notifications.service';
import type {
  UpsertVerificationDto,
  VerificationDocumentDto,
} from '../dto/support.dto';
import { VERIFICATION_STATUS_LABEL_AR } from '../constants/support.constants';

function assertSupportFileKeyOwnedByUser(
  fileKey: string,
  userId: string,
): void {
  const normalized = fileKey.replace(/^\/+/, '');
  const expectedPrefix = `support/${userId}/`;
  if (!normalized.startsWith(expectedPrefix)) {
    throwApi(400, 'invalid_file', 'ملف غير صالح');
  }
}

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
});

const adminUpdateSchema = z
  .object({
    status: z
      .enum([
        'DRAFT',
        'UNDER_REVIEW',
        'NEEDS_AMENDMENTS',
        'VERIFIED',
        'REJECTED',
      ])
      .optional(),
    reviewReason: z.string().max(2000).optional(),
    adminNotes: z.string().max(5000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

@Injectable()
export class AccountVerificationService {
  constructor(
    private readonly repo: SupportRepository,
    private readonly notifications: SupportNotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  getMeta() {
    return {
      statuses: Object.entries(VERIFICATION_STATUS_LABEL_AR).map(
        ([value, labelAr]) => ({
          value,
          labelAr,
        }),
      ),
      documentTypes: [
        { value: 'NATIONAL_ID', labelAr: 'الهوية الوطنية' },
        { value: 'COMMERCIAL_REGISTER', labelAr: 'السجل التجاري' },
        { value: 'OTHER', labelAr: 'مستند آخر' },
      ],
      requirements: [
        'اسمك الكامل كما في الهوية',
        'رقم الهوية الوطنية',
        'صورة واضحة للهوية الوطنية',
        'للحسابات التجارية: اسم المنشأة ونوع النشاط والسجل التجاري',
      ],
    };
  }

  async getUserRequest(user: JwtPayload) {
    let request = await this.repo.getVerificationByUserId(user.userId);
    if (!request) {
      request = await this.repo.upsertVerification(user.userId, {
        status: 'DRAFT',
      });
    }
    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { verified: true },
    });
    return {
      request,
      userVerified: userRecord?.verified ?? false,
    };
  }

  async upsertDraft(user: JwtPayload, dto: UpsertVerificationDto) {
    const existing = await this.repo.getVerificationByUserId(user.userId);
    if (existing && !['DRAFT', 'NEEDS_AMENDMENTS'].includes(existing.status)) {
      throwApi(400, 'invalid_status', 'لا يمكن تعديل الطلب في حالته الحالية');
    }

    const request = await this.repo.upsertVerification(user.userId, {
      fullName: dto.fullName?.trim(),
      nationalId: dto.nationalId?.trim(),
      businessName: dto.businessName?.trim(),
      businessType: dto.businessType?.trim(),
      additionalInfo: dto.additionalInfo?.trim(),
      status:
        existing?.status === 'NEEDS_AMENDMENTS' ? 'NEEDS_AMENDMENTS' : 'DRAFT',
    });

    return { request };
  }

  async addDocument(user: JwtPayload, dto: VerificationDocumentDto) {
    const request = await this.repo.getVerificationByUserId(user.userId);
    if (!request) throwApi(404, 'not_found', 'لا يوجد طلب توثيق');
    if (!['DRAFT', 'NEEDS_AMENDMENTS'].includes(request.status)) {
      throwApi(400, 'invalid_status', 'لا يمكن إرفاق مستندات في هذه الحالة');
    }

    assertSupportFileKeyOwnedByUser(dto.fileKey, user.userId);

    const doc = await this.repo.addVerificationDocument({
      request: { connect: { id: request.id } },
      type: dto.type,
      fileKey: dto.fileKey,
      fileUrl: dto.fileUrl,
      originalFileName: dto.originalFileName,
      mimeType: dto.mimeType,
      fileSizeBytes: dto.fileSizeBytes,
    });

    return { document: doc };
  }

  async removeDocument(user: JwtPayload, documentId: string) {
    const request = await this.repo.getVerificationByUserId(user.userId);
    if (!request) throwApi(404, 'not_found', 'لا يوجد طلب توثيق');
    if (!['DRAFT', 'NEEDS_AMENDMENTS'].includes(request.status)) {
      throwApi(400, 'invalid_status', 'لا يمكن حذف مستندات في هذه الحالة');
    }
    await this.repo.deleteVerificationDocument(documentId, request.id);
    return { ok: true };
  }

  async submit(user: JwtPayload) {
    const request = await this.repo.getVerificationByUserId(user.userId);
    if (!request) throwApi(404, 'not_found', 'لا يوجد طلب توثيق');
    if (!['DRAFT', 'NEEDS_AMENDMENTS'].includes(request.status)) {
      throwApi(400, 'invalid_status', 'تم إرسال الطلب مسبقاً');
    }
    if (!request.fullName?.trim() || !request.nationalId?.trim()) {
      throwApi(400, 'missing_fields', 'يرجى تعبئة الاسم ورقم الهوية');
    }
    const hasIdDoc = request.documents.some((d) => d.type === 'NATIONAL_ID');
    if (!hasIdDoc) {
      throwApi(400, 'missing_documents', 'يرجى إرفاق صورة الهوية الوطنية');
    }

    const updated = await this.repo.updateVerification(request.id, {
      status: 'UNDER_REVIEW',
      submittedAt: new Date(),
      reviewReason: null,
    });

    await this.repo.addVerificationTimeline({
      request: { connect: { id: request.id } },
      action: 'SUBMIT',
      actorId: user.userId,
    });

    await this.notifications.notifyVerificationSubmitted(user.userId);

    return { request: updated };
  }

  async listAdmin(query: Record<string, unknown>) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    return this.repo.listVerificationRequests(parsed.data);
  }

  async getAdmin(id: string) {
    const request = await this.repo.getVerificationById(id);
    if (!request) throwApi(404, 'not_found', 'الطلب غير موجود');
    return { request };
  }

  async updateAdmin(
    staff: JwtPayload,
    id: string,
    body: Record<string, unknown>,
  ) {
    const parsed = adminUpdateSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');

    const existing = await this.repo.getVerificationById(id);
    if (!existing) throwApi(404, 'not_found', 'الطلب غير موجود');

    const { status, reviewReason, adminNotes } = parsed.data;

    if (
      (status === 'REJECTED' || status === 'NEEDS_AMENDMENTS') &&
      !reviewReason?.trim()
    ) {
      throwApi(400, 'reason_required', 'يرجى كتابة سبب الرفض أو التعديل');
    }

    const updated = await this.repo.updateVerification(id, {
      status,
      reviewReason: reviewReason?.trim(),
      adminNotes: adminNotes?.trim(),
      reviewedBy: { connect: { id: staff.userId } },
      reviewedAt: status ? new Date() : undefined,
    });

    if (status && status !== existing.status) {
      await this.repo.addVerificationTimeline({
        request: { connect: { id } },
        action: status,
        actorId: staff.userId,
        note: reviewReason?.trim(),
      });

      if (status === 'UNDER_REVIEW') {
        await this.notifications.notifyVerificationReviewStarted(
          existing.userId,
        );
      } else if (status === 'NEEDS_AMENDMENTS') {
        await this.notifications.notifyVerificationNeedsAmendments(
          existing.userId,
          reviewReason ?? '',
        );
      } else if (status === 'VERIFIED') {
        await this.prisma.user.update({
          where: { id: existing.userId },
          data: { verified: true },
        });
        await this.notifications.notifyVerificationApproved(existing.userId);
      } else if (status === 'REJECTED') {
        await this.notifications.notifyVerificationRejected(
          existing.userId,
          reviewReason ?? '',
        );
      }
    }

    return { request: updated };
  }
}
