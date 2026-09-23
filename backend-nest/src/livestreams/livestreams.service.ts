import { Injectable } from '@nestjs/common';
import { LivestreamsRepository } from './repositories/livestreams.repository';
import { RedisService } from '../redis/redis.service';
import {
  generateHostToken,
  generateViewerToken,
  streamIdToChannel,
} from '../shared/lib/agora';
import { SubscriptionEntitlementService } from '../subscriptions/services/subscription-entitlement.service';
import { SubscriptionLifecycleService } from '../subscriptions/services/subscription-lifecycle.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { LoggerService } from '../common/services/logger.service';
import { throwApi, ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  createStreamBodySchema,
  type CreateStreamBodyDto,
} from './dto/livestreams.dto';

@Injectable()
export class LivestreamsService {
  constructor(
    private readonly repo: LivestreamsRepository,
    private readonly redis: RedisService,
    private readonly notifications: AppNotificationsService,
    private readonly logger: LoggerService,
    private readonly subscriptionLifecycle: SubscriptionLifecycleService,
    private readonly entitlements: SubscriptionEntitlementService,
  ) {}

  private async resolveLiveAccess(userId: string) {
    await this.subscriptionLifecycle.expireIfNeededForUser(userId);
    return this.entitlements.assertCanCreateLiveStream(userId);
  }

  async listStreams() {
    const cacheKey = this.redis.CacheKeys.liveStreams();
    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const streams = await this.repo.findLiveStreams();
      await this.redis.cacheSet(cacheKey, streams, 15);
      return streams;
    } catch (err) {
      this.logger.error({ err }, 'List livestreams error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async createStream(user: JwtPayload, body: CreateStreamBodyDto) {
    const parsed = createStreamBodySchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    try {
      const existing = await this.repo.findActiveStreamByHost(user.userId);
      if (existing) {
        throwApi(409, 'stream_exists', 'لديك بث مباشر نشط بالفعل');
      }

      const listingsCount = await this.repo.countListingsBySeller(user.userId);
      if (listingsCount === 0) {
        throwApi(
          403,
          'listing_required',
          'يجب نشر إعلان واحد على الأقل في السوق قبل بدء بث مباشر',
        );
      }

      const access = await this.resolveLiveAccess(user.userId);
      if (!access.allowed) {
        throwApi(403, access.code, access.messageAr);
      }

      const stream = await this.repo.createStream({
        hostId: user.userId,
        title: parsed.data.title,
        arabicTitle: parsed.data.arabicTitle,
        category: parsed.data.category,
        topic: parsed.data.topic,
        thumbnail: parsed.data.thumbnail,
      });

      const agoraChannel = streamIdToChannel(stream.id);
      const { token: agoraToken, uid: agoraUid } = generateHostToken(
        stream.id,
        user.userId,
      );

      this.logger.info(
        { streamId: stream.id, userId: user.userId },
        'Live stream created',
      );

      return {
        streamId: stream.id,
        agoraAppId: process.env.AGORA_APP_ID,
        agoraChannel,
        agoraToken,
        agoraUid,
      };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Create livestream error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async checkEligibility(userId: string) {
    try {
      const listingsCount = await this.repo.countListingsBySeller(userId);
      const access = await this.resolveLiveAccess(userId);
      const hasListing = listingsCount > 0;

      return {
        canStream: hasListing && access.allowed,
        listingsCount,
        planId: access.planId,
        ...(!access.allowed
          ? { reason: access.code }
          : {
              liveMinutesLimit: access.liveMinutesLimit,
              liveMinutesUsed: access.liveMinutesUsed,
            }),
      };
    } catch {
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async startStream(id: string, user: JwtPayload) {
    try {
      const stream = await this.repo.findStreamForStart(id);
      if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
      if (stream.hostId !== user.userId)
        throwApi(403, 'forbidden', 'غير مسموح');
      if (stream.isLive) throwApi(409, 'already_live', 'البث نشط بالفعل');

      const access = await this.resolveLiveAccess(user.userId);
      if (!access.allowed) {
        throwApi(403, access.code, access.messageAr);
      }

      await this.repo.startStream(id);
      await this.redis.cacheDel(this.redis.CacheKeys.liveStreams());

      void this.notifyFollowers(user.userId, stream).catch(() => {});

      this.logger.info({ streamId: id, userId: user.userId }, 'Stream started');

      return { started: true, startedAt: new Date() };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Start stream error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async endStream(id: string, user: JwtPayload) {
    try {
      const stream = await this.repo.findStreamForEnd(id);
      if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
      if (stream.hostId !== user.userId)
        throwApi(403, 'forbidden', 'غير مسموح');

      const endedAt = new Date();
      const durationMinutes = stream.startedAt
        ? Math.round((endedAt.getTime() - stream.startedAt.getTime()) / 60000)
        : 0;

      await this.repo.endStream(id, endedAt);

      if (durationMinutes > 0) {
        await this.repo
          .incrementLiveMinutes(user.userId, durationMinutes)
          .catch(() => {});
      }

      await this.redis.cacheDel(this.redis.CacheKeys.liveStreams());

      this.logger.info({ streamId: id, durationMinutes }, 'Stream ended');

      return {
        ended: true,
        endedAt,
        durationMinutes,
        peakViewers: stream.peakViewers,
      };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'End stream error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async getViewerToken(id: string, user: JwtPayload) {
    try {
      const stream = await this.repo.findStreamForToken(id);
      if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
      if (!stream.isLive) throwApi(410, 'stream_ended', 'انتهى البث');

      const agoraChannel = streamIdToChannel(id);
      const { token: agoraToken, uid: agoraUid } = generateViewerToken(
        id,
        user.userId,
      );

      return {
        agoraAppId: process.env.AGORA_APP_ID,
        agoraChannel,
        agoraToken,
        agoraUid,
        expiresIn: 7200,
      };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Get viewer token error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async getStream(id: string) {
    try {
      const stream = await this.repo.findStreamDetail(id);
      if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
      return stream;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Get stream error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  private async notifyFollowers(
    hostId: string,
    stream: { arabicTitle: string; title: string; id: string },
  ) {
    const followers = await this.repo.findFollowers(hostId);

    await this.notifications.notifyUsers(
      followers.map((f) => f.followerId),
      {
        type: 'live_start',
        titleAr: 'بث مباشر جديد',
        bodyAr: `${stream.arabicTitle} — ابدأ المشاهدة الآن`,
        data: { streamId: stream.id },
      },
    );
  }
}
