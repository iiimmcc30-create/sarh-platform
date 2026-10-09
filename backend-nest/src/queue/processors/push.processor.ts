import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../constants';
import type { PushJob } from '../types/queue.types';
import {
  buildExpoMessage,
  pushTransportFor,
  sendExpoPush,
} from '../lib/push-transport';

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

  /** Drop a dead token from both the device table and the legacy column. */
  private async pruneToken(token: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userDeviceToken.deleteMany({ where: { token } }),
      this.prisma.user.updateMany({
        where: { fcmToken: token },
        data: { fcmToken: null },
      }),
    ]);
  }

  async process(job: Job<PushJob>): Promise<void> {
    if (job.name !== 'send') return;

    const { fcmToken: token, titleAr, bodyAr, data } = job.data;
    if (!token) return;

    const transport = pushTransportFor(token);

    if (transport === 'apns_raw') {
      // Raw APNs token from an old iOS build: undeliverable via FCM/Expo.
      // The updated app re-registers an Expo push token on next launch.
      await this.pruneToken(token);
      return;
    }

    if (transport === 'expo') {
      const result = await sendExpoPush(
        buildExpoMessage({ token, titleAr, bodyAr, data }),
        { accessToken: process.env.EXPO_ACCESS_TOKEN },
      );
      if (result.ok) return;
      if (result.unregistered) {
        await this.pruneToken(token);
        return;
      }
      if (result.retryable) throw new Error(`Expo push: ${result.error}`);
      console.warn('Expo push rejected', result.error);
      return;
    }

    if (!getApps().length) return;

    try {
      await getMessaging().send({
        token,
        notification: { title: titleAr, body: bodyAr },
        data: data || {},
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        await this.pruneToken(token);
        return;
      }
      throw err;
    }
  }
}
