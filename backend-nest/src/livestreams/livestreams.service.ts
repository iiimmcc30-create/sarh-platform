import { Injectable } from '@nestjs/common';
import { LivestreamsRepository } from './repositories/livestreams.repository';
import { RedisService } from '../redis/redis.service';
import { LiveSocketBridgeService } from '../gateway/services/live-socket-bridge.service';
import {
  generateHostToken,
  generateViewerToken,
  streamIdToChannel,
} from '../shared/lib/agora';
import { getRtcProvider } from '../shared/rtc/rtc-provider';
import {
  LIVEKIT_HOST_TTL_SEC,
  LIVEKIT_VIEWER_TTL_SEC,
  createLivekitToken,
  deleteLivekitRoom,
  isLivekitConfigured,
  listLivekitIdentities,
  liveRoomName,
  requireLivekitConfig,
} from '../shared/rtc/livekit';
import {
  decideViewerAdmission,
  getRtcLimits,
  shouldAutostartHls,
} from '../shared/rtc/limits';
import { HLS_LATENCY_SECONDS } from '../shared/rtc/hls-config';
import { HlsEgressService } from './hls-egress.service';
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
import { assertUserMediaUrls } from '../shared/lib/media-ownership';

@Injectable()
export class LivestreamsService {
  constructor(
    private readonly repo: LivestreamsRepository,
    private readonly redis: RedisService,
    private readonly notifications: AppNotificationsService,
    private readonly logger: LoggerService,
    private readonly subscriptionLifecycle: SubscriptionLifecycleService,
    private readonly entitlements: SubscriptionEntitlementService,
    private readonly liveBridge: LiveSocketBridgeService,
    private readonly hls: HlsEgressService,
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

      // Optional cover image: only our upload storage, the host's own folder,
      // real size/format (same save-time check as listings/posts/stories).
      await assertUserMediaUrls([parsed.data.thumbnail], user.userId);

      const stream = await this.repo.createStream({
        hostId: user.userId,
        title: parsed.data.title,
        arabicTitle: parsed.data.arabicTitle,
        category: parsed.data.category,
        topic: parsed.data.topic,
        thumbnail: parsed.data.thumbnail,
      });

      const media = await this.issueCredentials(stream.id, user.userId, 'host');

      this.logger.info(
        { streamId: stream.id, userId: user.userId, provider: media.provider },
        'Live stream created',
      );

      return {
        streamId: stream.id,
        ...media,
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

      const provider = getRtcProvider();
      return {
        canStream: hasListing && access.allowed,
        provider,
        agoraAppId:
          provider === 'agora' ? (process.env.AGORA_APP_ID ?? null) : null,
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

      await this.finishStream(stream, endedAt, durationMinutes, user.userId);

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

      if (getRtcProvider() === 'livekit' && user.userId !== stream.hostId) {
        const limits = getRtcLimits();
        const room = liveRoomName(id);
        const atCap = (viewers: number, cluster: number) =>
          decideViewerAdmission({
            roomViewers: viewers,
            clusterViewers: cluster,
            limits,
            hlsUrl: null,
            hlsStartable: false,
            alreadyInRoom: false,
          }).mode !== 'webrtc';
        const clusterViewers =
          limits.maxParticipantsPerNode > 0
            ? await this.repo.sumLiveViewers()
            : 0;
        if (atCap(stream.viewers, clusterViewers)) {
          const identities = await listLivekitIdentities(room);
          const admission = decideViewerAdmission({
            roomViewers: identities
              ? identities.filter((i) => i !== stream.hostId).length
              : stream.viewers,
            clusterViewers,
            limits,
            hlsUrl: stream.hlsUrl,
            hlsStartable: this.hls.isEnabled(),
            alreadyInRoom: identities?.includes(user.userId) ?? false,
          });
          if (admission.mode === 'hls') {
            return this.hlsCredentials(admission.hlsUrl);
          }
          if (admission.mode === 'full') {
            return this.fullRoomFallback(id, admission);
          }
        }
      }

      return this.issueCredentials(id, user.userId, 'viewer', stream.hlsUrl);
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Get viewer token error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  /**
   * LiveKit `room_finished`: end the stream if it is still live, bill minutes,
   * and tell viewers. Idempotent.
   */
  async endStreamBySystem(id: string) {
    const stream = await this.repo.findStreamForEnd(id);
    if (!stream?.isLive) return { ended: false };
    const endedAt = new Date();
    const durationMinutes = stream.startedAt
      ? Math.round((endedAt.getTime() - stream.startedAt.getTime()) / 60000)
      : 0;
    await this.finishStream(stream, endedAt, durationMinutes, stream.hostId);
    return { ended: true, endedAt, durationMinutes };
  }

  /** Absolute viewer count from LiveKit identities (the host is not a viewer). */
  async setViewerCountFromIdentities(id: string, identities: string[]) {
    const stream = await this.repo.findStreamForEnd(id);
    if (!stream?.isLive) return;
    const viewers = identities.filter(
      (identity) => identity !== stream.hostId,
    ).length;
    await this.repo.setStreamViewers(id, viewers);
    if (viewers > stream.peakViewers) {
      await this.repo.raisePeakViewers(id, viewers).catch(() => {});
    }
    this.liveBridge.toStream(id, 'live:viewers', viewers);
    if (shouldAutostartHls(viewers)) void this.hls.tryStart(id);
  }

  /**
   * WebRTC slots are full. A playlist is only handed out once it is verified live;
   * otherwise the client gets an explicit state (preparing / failed / full) it can show.
   */
  private async fullRoomFallback(
    id: string,
    admission: { reason: 'room_full' | 'cluster_full'; hlsStartable: boolean },
  ): Promise<never | ReturnType<LivestreamsService['hlsCredentials']>> {
    let status = this.hls.isEnabled() ? await this.hls.status(id) : null;
    if (status?.state === 'off' && admission.hlsStartable) {
      try {
        await this.hls.start(id);
      } catch {
        // recorded as `failed` by the HLS service
      }
      status = await this.hls.status(id);
    }
    if (status?.state === 'ready' && status.hlsUrl) {
      return this.hlsCredentials(status.hlsUrl);
    }
    const state = status?.state ?? 'off';
    const error =
      state === 'preparing'
        ? 'hls_preparing'
        : state === 'failed'
          ? 'hls_failed'
          : admission.reason;
    const message =
      state === 'preparing'
        ? 'البث ممتلئ — جارٍ تجهيز المشاهدة عبر الخادم الموزّع'
        : state === 'failed'
          ? 'تعذر تجهيز المشاهدة البديلة — سننتظر مقعداً فارغاً'
          : 'البث ممتلئ حالياً';
    throwApi(503, error, message, {
      hlsState: state,
      reason: status?.reason ?? null,
      retryAfterSeconds: status?.retryAfterSeconds ?? 10,
    });
  }

  async hlsStatus(id: string) {
    return this.hls.status(id);
  }

  async startHls(id: string, user: JwtPayload) {
    const stream = await this.repo.findStreamForHls(id);
    if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
    if (stream.hostId !== user.userId) throwApi(403, 'forbidden', 'غير مسموح');
    return this.hls.start(id);
  }

  async stopHls(id: string, user: JwtPayload) {
    const stream = await this.repo.findStreamForHls(id);
    if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
    if (stream.hostId !== user.userId) throwApi(403, 'forbidden', 'غير مسموح');
    return this.hls.stop(id);
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

  private async finishStream(
    stream: { id: string; hostId: string },
    endedAt: Date,
    durationMinutes: number,
    hostId: string,
  ) {
    await this.hls.stop(stream.id).catch(() => undefined);
    await this.repo.endStream(stream.id, endedAt);
    if (durationMinutes > 0) {
      await this.repo
        .incrementLiveMinutes(hostId, durationMinutes)
        .catch(() => {});
    }
    await this.redis.cacheDel(this.redis.CacheKeys.liveStreams());
    if (getRtcProvider() === 'livekit') {
      await deleteLivekitRoom(liveRoomName(stream.id));
    }
    this.liveBridge.toStream(stream.id, 'live:ended', {
      endedAt: endedAt.toISOString(),
    });
    this.logger.info({ streamId: stream.id, durationMinutes }, 'Stream ended');
  }

  private async issueCredentials(
    streamId: string,
    userId: string,
    role: 'host' | 'viewer',
    hlsUrl: string | null = null,
  ) {
    const room = streamIdToChannel(streamId);
    const provider = getRtcProvider();
    if (provider === 'agora') {
      const issued =
        role === 'host'
          ? generateHostToken(streamId, userId)
          : generateViewerToken(streamId, userId);
      return {
        provider: 'agora' as const,
        agoraAppId: process.env.AGORA_APP_ID ?? null,
        agoraChannel: room,
        agoraToken: issued.token,
        agoraUid: issued.uid,
        livekitUrl: null,
        livekitToken: null,
        livekitRoom: null,
        mode: 'webrtc' as const,
        hlsUrl: null,
        hlsLatencySeconds: null,
        expiresIn:
          role === 'host' ? LIVEKIT_HOST_TTL_SEC : LIVEKIT_VIEWER_TTL_SEC,
      };
    }
    if (!isLivekitConfigured()) {
      throwApi(503, 'livekit_unavailable', 'البث غير متاح حالياً');
    }
    const ttl = role === 'host' ? LIVEKIT_HOST_TTL_SEC : LIVEKIT_VIEWER_TTL_SEC;
    const livekitToken = await createLivekitToken({
      identity: userId,
      room: liveRoomName(streamId),
      ttlSeconds: ttl,
      publish: role === 'host' ? 'av' : 'none',
    });
    return {
      provider: 'livekit' as const,
      agoraAppId: null,
      agoraChannel: room,
      agoraToken: null,
      agoraUid: null,
      livekitUrl: requireLivekitConfig().url,
      livekitToken,
      livekitRoom: liveRoomName(streamId),
      mode: 'webrtc' as const,
      hlsUrl: role === 'viewer' ? hlsUrl : null,
      hlsLatencySeconds:
        role === 'viewer' && hlsUrl ? HLS_LATENCY_SECONDS : null,
      expiresIn: ttl,
    };
  }

  /** WebRTC slots are full: the viewer plays the CDN-backed HLS stream instead. */
  private hlsCredentials(hlsUrl: string) {
    return {
      provider: 'livekit' as const,
      agoraAppId: null,
      agoraChannel: null,
      agoraToken: null,
      agoraUid: null,
      livekitUrl: null,
      livekitToken: null,
      livekitRoom: null,
      mode: 'hls' as const,
      hlsUrl,
      hlsLatencySeconds: HLS_LATENCY_SECONDS,
      expiresIn: LIVEKIT_VIEWER_TTL_SEC,
    };
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
