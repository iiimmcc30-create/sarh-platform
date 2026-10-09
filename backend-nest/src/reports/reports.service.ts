import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type { CreateReportDto } from './dto/reports.dto';

const TARGET_LABEL_AR: Record<CreateReportDto['targetType'], string> = {
  listing: 'إعلان',
  post: 'منشور',
  user: 'مستخدم',
  story: 'قصة',
  collection: 'مجموعة',
  council_image: 'صورة في مجلس',
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private ticketNumber() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `RPT-${stamp}-${rand}`;
  }

  async create(user: JwtPayload, dto: CreateReportDto) {
    if (dto.targetType === 'user' && dto.targetId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك الإبلاغ عن نفسك');
    }

    // «عرض صورة»: capture the exact image (it can be replaced or removed later).
    let imageLines: string[] = [];
    let imageMeta: Record<string, string | null> = {};
    if (dto.targetType === 'council_image') {
      const council = await this.prisma.council.findUnique({
        where: { id: dto.targetId },
        select: { imageUrl: true, imageById: true, imageListingId: true },
      });
      if (!council?.imageUrl) {
        throwApi(404, 'not_found', 'لا توجد صورة معروضة في هذا المجلس');
      }
      if (council.imageById === user.userId) {
        throwApi(400, 'invalid_action', 'لا يمكنك الإبلاغ عن صورتك');
      }
      imageLines = [
        `الصورة: ${council.imageUrl}`,
        council.imageById ? `صاحب الصورة: ${council.imageById}` : null,
        council.imageListingId ? `الإعلان: ${council.imageListingId}` : null,
      ].filter((l): l is string => Boolean(l));
      imageMeta = {
        imageUrl: council.imageUrl,
        imageById: council.imageById,
      };
    }

    const label = TARGET_LABEL_AR[dto.targetType];
    const subject = `بلاغ على ${label}: ${dto.reason}`;
    const description = [
      `النوع: ${dto.targetType}`,
      `المعرّف: ${dto.targetId}`,
      `السبب: ${dto.reason}`,
      ...imageLines,
      dto.details ? `التفاصيل: ${dto.details}` : null,
      `المُبلِغ: ${user.username} (${user.userId})`,
    ]
      .filter(Boolean)
      .join('\n');

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber: this.ticketNumber(),
        type: 'REPORT',
        category: 'REPORT',
        priority: 'NORMAL',
        status: 'OPEN',
        subject,
        description,
        reporterId: user.userId,
        // Structured copy for «بلاغاتي» (description stays for staff).
        metadata: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          ...imageMeta,
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        createdAt: true,
      },
    });

    return ticket;
  }
}
