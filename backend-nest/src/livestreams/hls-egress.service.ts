import { Injectable } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { ApiException, throwApi } from '../common/exceptions/api.exception';
import { RedisService } from '../redis/redis.service';
import {
  getHlsConfig,
  hlsPlaylistUrl,
  HLS_LATENCY_SECONDS,
} from '../shared/rtc/hls-config';
import { playlistHasSegments } from '../shared/rtc/hls-probe';
import {
  HostNotPublishingError,
  egressFinished,
  startHlsEgress,
  stopEgress,
} from '../shared/rtc/livekit-egress';
import { isLivekitConfigured, liveRoomName } from '../shared/rtc/livekit';
import { LivestreamsRepository } from './repositories/livestreams.repository';

export type HlsState = 'off' | 'preparing' | 'ready' | 'failed';

export interface HlsStatus {
  state: HlsState;
  hlsUrl: string | null;
  latencySeconds: number;
  /** failed: timeout | egress_unavailable | host_not_publishing | egress_failed | ... */
  reason: string | null;
  retryAfterSeconds: number;
}

interface EgressEventInfo {
  egressId?: string;
  roomName?: string;
  status?: number;
  error?: string;
}

const FAILURE_TTL_SEC = 120;
const failKey = (id: string) => `live:hls:failed:${id}`;
const startedKey = (id: string) => `live:hls:started:${id}`;

function envSeconds(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * HLS output for big video rooms. State machine (what viewers see):
 *   off -> preparing (egress requested, no segments yet) -> ready (playlist has segments)
 *   preparing/ready -> failed (egress error, no worker, or not ready within the timeout)
 * `hlsUrl` on the stream is only ever set in `ready`.
 */
@Injectable()
export class HlsEgressService {
  private readonly starting = new Set<string>();

  constructor(
    private readonly repo: LivestreamsRepository,
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
  ) {}

  isEnabled(): boolean {
    return getHlsConfig() !== null && isLivekitConfigured();
  }

  /** Idempotent. Resolves in `preparing`/`ready`; throws (and records `failed`) otherwise. */
  async start(streamId: string) {
    const cfg = getHlsConfig();
    if (!cfg || !isLivekitConfigured()) {
      throwApi(503, 'hls_unavailable', 'البث عبر CDN غير مفعّل');
    }
    const stream = await this.repo.findStreamForHls(streamId);
    if (!stream) throwApi(404, 'not_found', 'البث غير موجود');
    if (!stream.isLive) throwApi(409, 'not_live', 'البث غير نشط');
    if (stream.hlsEgressId) {
      return { started: false, ...(await this.status(streamId)) };
    }
    if (this.starting.has(streamId)) {
      return { started: false, ...(await this.status(streamId)) };
    }
    this.starting.add(streamId);
    try {
      const timeoutMs =
        envSeconds('HLS_EGRESS_START_TIMEOUT_SECONDS', 20) * 1000;
      const started = await Promise.race([
        startHlsEgress({
          cfg,
          streamId,
          room: liveRoomName(streamId),
          hostIdentity: stream.hostId,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('egress_start_timeout')),
            timeoutMs,
          ),
        ),
      ]);
      await this.redis.cacheDel(failKey(streamId));
      await this.redis.cacheSet(startedKey(streamId), Date.now(), 600);
      await this.repo.setStreamHlsPreparing(streamId, started.egressId);
      this.logger.info(
        { streamId, egressId: started.egressId },
        'HLS egress requested',
      );
      return { started: true, ...(await this.status(streamId)) };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      const reason =
        err instanceof HostNotPublishingError
          ? 'host_not_publishing'
          : 'egress_unavailable';
      await this.recordFailure(streamId, reason);
      this.logger.error({ err, streamId }, 'HLS egress start failed');
      if (reason === 'host_not_publishing') {
        throwApi(409, 'host_not_publishing', 'المضيف لم يبدأ النشر بعد');
      }
      throwApi(502, 'hls_start_failed', 'تعذر تشغيل البث عبر CDN', { reason });
    } finally {
      this.starting.delete(streamId);
    }
  }

  /** Current state; probes the playlist while preparing and enforces the ready timeout. */
  async status(streamId: string): Promise<HlsStatus> {
    const cfg = getHlsConfig();
    const base = {
      latencySeconds: HLS_LATENCY_SECONDS,
      hlsUrl: null,
      reason: null,
      retryAfterSeconds: 3,
    };
    if (!cfg) return { ...base, state: 'off' };
    const stream = await this.repo.findStreamForHls(streamId);
    if (!stream?.isLive) return { ...base, state: 'off' };
    if (stream.hlsUrl) {
      return { ...base, state: 'ready', hlsUrl: stream.hlsUrl };
    }
    if (stream.hlsEgressId) {
      const url = hlsPlaylistUrl(cfg, streamId);
      if (await playlistHasSegments(url)) {
        await this.repo.setStreamHlsReady(streamId, stream.hlsEgressId, url);
        return { ...base, state: 'ready', hlsUrl: url };
      }
      const startedAt =
        (await this.redis.cacheGet<number>(startedKey(streamId))) ?? 0;
      const limitMs = envSeconds('HLS_READY_TIMEOUT_SECONDS', 45) * 1000;
      if (startedAt && Date.now() - startedAt > limitMs) {
        await this.fail(streamId, stream.hlsEgressId, 'timeout');
        return {
          ...base,
          state: 'failed',
          reason: 'timeout',
          retryAfterSeconds: 10,
        };
      }
      if (!startedAt) {
        await this.redis.cacheSet(startedKey(streamId), Date.now(), 600);
      }
      return { ...base, state: 'preparing' };
    }
    const reason = await this.redis.cacheGet<string>(failKey(streamId));
    if (reason) {
      return { ...base, state: 'failed', reason, retryAfterSeconds: 10 };
    }
    return { ...base, state: 'off' };
  }

  async stop(streamId: string) {
    const stream = await this.repo.findStreamForHls(streamId);
    if (!stream?.hlsEgressId) return { stopped: false };
    await stopEgress(stream.hlsEgressId);
    await this.repo.clearStreamHls(streamId, stream.hlsEgressId);
    await this.redis.cacheDel(startedKey(streamId));
    return { stopped: true };
  }

  /** Best-effort kick-off used by the viewer-count autostart; never throws. */
  async tryStart(streamId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.start(streamId);
    } catch (err) {
      if (err instanceof ApiException) return;
      this.logger.warn({ err, streamId }, 'HLS autostart failed');
    }
  }

  /**
   * LiveKit `egress_started` / `egress_updated` / `egress_ended`. Only an egress that
   * matches the stored id may change state, so a late event from an earlier egress
   * cannot kill a newer one. An ended egress with an error (or failed/aborted/limit
   * status) becomes `failed`, never silently `off`.
   */
  async handleEgressEvent(
    event: 'egress_started' | 'egress_updated' | 'egress_ended',
    info: EgressEventInfo | undefined,
    streamId: string,
  ) {
    if (!info?.egressId) return;
    const cfg = getHlsConfig();
    if (event === 'egress_started') {
      const stream = await this.repo.findStreamForHls(streamId);
      if (cfg && stream?.isLive && !stream.hlsEgressId) {
        await this.repo.setStreamHlsPreparing(streamId, info.egressId);
      }
      return;
    }
    const ended = event === 'egress_ended' || egressFinished(info.status);
    if (!ended) {
      if (event === 'egress_updated') await this.status(streamId);
      return;
    }
    const failed =
      Boolean(info.error) ||
      (info.status !== undefined &&
        egressFinished(info.status) &&
        info.status !== 3);
    if (failed) {
      await this.fail(streamId, info.egressId, info.error || 'egress_failed');
    } else {
      await this.repo.clearStreamHls(streamId, info.egressId);
    }
    this.logger.info(
      { streamId, egressId: info.egressId, status: info.status, failed },
      'HLS egress ended',
    );
  }

  latencySeconds(): number {
    return HLS_LATENCY_SECONDS;
  }

  private async fail(streamId: string, egressId: string, reason: string) {
    await stopEgress(egressId);
    await this.repo.clearStreamHls(streamId, egressId);
    await this.recordFailure(streamId, reason);
  }

  private async recordFailure(streamId: string, reason: string) {
    await this.redis.cacheSet(failKey(streamId), reason, FAILURE_TTL_SEC);
  }
}
