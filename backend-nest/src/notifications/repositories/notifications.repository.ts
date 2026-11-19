import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  mentionsNotificationWhere,
  type NotificationInboxTab,
} from '../notification-inbox';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    userId: string,
    cursor: string | undefined,
    pageSize: number,
    tab: NotificationInboxTab = 'all',
  ) {
    const where: Prisma.NotificationWhereInput =
      tab === 'mentions' ? mentionsNotificationWhere(userId) : { userId };
    return this.prisma.notification.findMany({
      where,
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  markReadByIds(userId: string, ids: string[]) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
