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

    const label = TARGET_LABEL_AR[dto.targetType];
    const subject = `بلاغ على ${label}: ${dto.reason}`;
    const description = [
      `النوع: ${dto.targetType}`,
      `المعرّف: ${dto.targetId}`,
      `السبب: ${dto.reason}`,
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
