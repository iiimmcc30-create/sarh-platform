import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import type { NotifyUserInput } from '../types/queue.types';
import type { NotificationJob } from '../types/queue.types';
import { NotificationQueueService } from './notification-queue.service';

@Injectable()
export class AppNotificationsService {
  constructor(
    private readonly notifications: NotificationQueueService,
    private readonly logger: LoggerService,
  ) {}

  stringifyNotificationData(
    data: Record<string, string | number | boolean | null | undefined>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      out[key] = String(value);
    }
    return out;
  }

  async notifyUser(input: NotifyUserInput): Promise<void> {
    try {
      const job: NotificationJob = {
        userId: input.userId,
        type: input.type,
        titleAr: input.titleAr,
        bodyAr: input.bodyAr,
        data: input.data
          ? this.stringifyNotificationData(input.data)
          : undefined,
      };
      await this.notifications.addNotification(job);
    } catch (err) {
      this.logger.warn(
        { err, userId: input.userId, type: input.type },
        'notifyUser failed',
      );
    }
  }

  async notifyUsers(
    userIds: string[],
    input: Omit<NotifyUserInput, 'userId'>,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await Promise.allSettled(
      userIds.map((userId) => this.notifyUser({ ...input, userId })),
    );
  }
}
