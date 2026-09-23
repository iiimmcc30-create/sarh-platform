import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../constants';
import type { PushJob } from '../types/queue.types';

@Injectable()
@Processor(QUEUE_NAMES.PUSH, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
    if (!getApps().length && process.env.FIREBASE_PROJECT_ID) {
      try {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          }),
        });
        console.log('Firebase messaging initialized');
      } catch (err) {
        console.error(
          'Firebase init failed',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  async process(job: Job<PushJob>): Promise<void> {
    if (job.name !== 'send') return;
    if (!getApps().length) return;

    const { fcmToken, titleAr, bodyAr, data } = job.data;

    try {
      await getMessaging().send({
        token: fcmToken,
        notification: { title: titleAr, body: bodyAr },
        data: data || {},
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'messaging/registration-token-not-registered') {
        await this.prisma.$transaction([
          this.prisma.userDeviceToken.deleteMany({
            where: { token: fcmToken },
          }),
          this.prisma.user.updateMany({
            where: { fcmToken },
            data: { fcmToken: null },
          }),
        ]);
        return;
      }
      throw err;
    }
  }
}
