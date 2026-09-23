import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoggerService } from '../../common/services/logger.service';
import { PushQueueService } from './push-queue.service';
import { NotificationRepository } from '../repositories/notification.repository';
import type { NotificationJob } from '../types/queue.types';
import { collectPushTokens } from '../lib/push-tokens';
import {
  isPrismaUniqueConflict,
  notificationRowIdFromQueueJob,
} from '../lib/notification-idempotency';

@Injectable()
export class NotificationPersistService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly pushQueue: PushQueueService,
    private readonly logger: LoggerService,
  ) {}

  async enqueuePushAfterPersist(params: {
    userId: string;
    notificationId: string;
    type: string;
    titleAr: string;
    bodyAr: string;
    data: Record<string, string>;
  }): Promise<void> {
    try {
      const user = await this.notifications.findUserPushTargets(params.userId);
      if (!user) return;
      const tokens = collectPushTokens(user);
      if (tokens.length === 0) return;

      await Promise.all(
        tokens.map((fcmToken) =>
          this.pushQueue.addPush({
            fcmToken,
            titleAr: params.titleAr,
            bodyAr: params.bodyAr,
            data: params.data,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(
        { err, userId: params.userId, notificationId: params.notificationId },
        'Failed to enqueue push after notification persist',
      );
    }
  }

  async persistNotificationAndEnqueuePush(
    job: NotificationJob,
    queueJobId?: string,
  ): Promise<string> {
    const notificationId = queueJobId
      ? notificationRowIdFromQueueJob(queueJobId)
      : randomUUID();
    const data: Record<string, string> = {
      ...(job.data || {}),
      notificationId,
    };

    let created = true;
    try {
      await this.notifications.createNotification({
        id: notificationId,
        userId: job.userId,
        type: job.type,
        titleAr: job.titleAr,
        bodyAr: job.bodyAr,
        data,
      });
    } catch (err) {
      if (!isPrismaUniqueConflict(err)) throw err;
      created = false;
    }

    if (!created) {
      return notificationId;
    }

    await this.enqueuePushAfterPersist({
      userId: job.userId,
      notificationId,
      type: job.type,
      titleAr: job.titleAr,
      bodyAr: job.bodyAr,
      data: { ...data, type: job.type },
    });

    return notificationId;
  }
}
