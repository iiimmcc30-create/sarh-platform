import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotificationsRepository } from './repositories/notifications.repository';
import { throwApi } from '../common/exceptions/api.exception';
import { NOTIFICATION_LIST_TAKE } from '../common/utils/query-limits';

const PAGE_SIZE = NOTIFICATION_LIST_TAKE;

const markReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict();

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async list(userId: string, cursor?: string) {
    const notifications = await this.repo.findMany(userId, cursor, PAGE_SIZE);

    const hasMore = notifications.length > PAGE_SIZE;
    const items = hasMore ? notifications.slice(0, -1) : notifications;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const unreadCount = await this.repo.countUnread(userId);

    return { notifications: items, nextCursor, hasMore, unreadCount };
  }

  async markRead(userId: string, body: unknown) {
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const { ids } = parsed.data;

    if (ids && ids.length > 0) {
      await this.repo.markReadByIds(userId, ids);
    } else {
      await this.repo.markAllRead(userId);
    }

    return { updated: true };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.repo.countUnread(userId);
    return { unreadCount };
  }
}
