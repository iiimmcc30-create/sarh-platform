import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { CouncilSocketBridgeService } from '../../gateway/services/council-socket-bridge.service';
import { uidFromUserId } from '../../shared/lib/agora';
import { CouncilPresenceService } from './council-presence.service';
import {
  COUNCIL_SPEAKER_SELECT,
  COUNCIL_USER_SELECT,
  type CouncilSpeakerRow,
} from '../lib/council-select';
import {
  councilPermissions,
  COUNCIL_MAX_SPEAKERS,
} from '../lib/council-policy';

const COUNT_THROTTLE_MS = 2_000;
const HOST_TOUCH_MS = 60_000;
export const COUNCIL_PENDING_REQUESTS_LIMIT = 50;

export type CouncilSpeaker = {
  userId: string;
  seatIndex: number;
  role: string;
  micMuted: boolean;
  mutedByModerator: boolean;
  online: boolean;
  agoraUid: number;
  user: CouncilSpeakerRow['user'];
};

/**
 * «المجالس» realtime + presence orchestration, shared by the API process (REST
 * mutations) and the socket process (join/leave/heartbeat). Events are sent through
 * CouncilSocketBridgeService, which works from either process.
 */
@Injectable()
export class CouncilRealtimeService {
  private readonly trailingCount = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly presence: CouncilPresenceService,
    private readonly bridge: CouncilSocketBridgeService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async loadSpeakers(councilId: string): Promise<CouncilSpeaker[]> {
    const rows = await this.prisma.councilMember.findMany({
      where: { councilId, seatIndex: { not: null } },
      orderBy: { seatIndex: 'asc' },
      take: COUNCIL_MAX_SPEAKERS,
      select: COUNCIL_SPEAKER_SELECT,
    });
    const present = await this.presence.presentAmong(
      councilId,
      rows.map((r) => r.userId),
    );
    return rows.map((r) => ({
      userId: r.userId,
      seatIndex: r.seatIndex ?? 0,
      role: r.role,
      micMuted: r.micMuted,
      mutedByModerator: r.mutedByModerator,
      online: present.has(r.userId),
      agoraUid: uidFromUserId(r.userId),
      user: r.user,
    }));
  }

  /** Present users who are not on stage (never below 0). */
  async listenerCount(councilId: string, speakers?: CouncilSpeaker[]) {
    const present = await this.presence.count(councilId);
    const list = speakers ?? (await this.loadSpeakers(councilId));
    const onlineSpeakers = list.filter((s) => s.online).length;
    return Math.max(0, present - onlineSpeakers);
  }

  async pendingRequests(councilId: string) {
    const rows = await this.prisma.councilSpeakRequest.findMany({
      where: { councilId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: COUNCIL_PENDING_REQUESTS_LIMIT,
      select: {
        id: true,
        createdAt: true,
        user: { select: COUNCIL_USER_SELECT },
      },
    });
    return rows;
  }

  // ─── Emits ────────────────────────────────────────────────────────────────

  async emitSpeakers(councilId: string) {
    const speakers = await this.loadSpeakers(councilId);
    const listenerCount = await this.listenerCount(councilId, speakers);
    this.bridge.toCouncil(councilId, 'council:speakers', {
      councilId,
      speakers,
      speakersCount: speakers.length,
      listenerCount,
    });
  }

  /** Throttled (leading + trailing) listener-count broadcast for busy rooms. */
  async emitListenerCount(councilId: string) {
    const claimed = await this.cache.claimOnce(
      `council:countemit:${councilId}`,
      Math.ceil(COUNT_THROTTLE_MS / 1000),
    );
    if (claimed) {
      await this.sendListenerCount(councilId);
      return;
    }
    if (this.trailingCount.has(councilId)) return;
    const timer = setTimeout(() => {
      this.trailingCount.delete(councilId);
      void this.sendListenerCount(councilId).catch(() => {});
    }, COUNT_THROTTLE_MS);
    timer.unref?.();
    this.trailingCount.set(councilId, timer);
  }

  private async sendListenerCount(councilId: string) {
    const listenerCount = await this.listenerCount(councilId);
    this.bridge.toCouncil(councilId, 'council:listeners', {
      councilId,
      listenerCount,
    });
  }

  /** Pending requests go only to the owner and moderators allowed to manage them. */
  async emitRequests(councilId: string) {
    const council = await this.prisma.council.findUnique({
      where: { id: councilId },
      select: {
        ownerId: true,
        modCanManageRequests: true,
        modCanMute: true,
        modCanRemove: true,
        modCanBan: true,
      },
    });
    if (!council) return;
    const managers = [council.ownerId];
    if (council.modCanManageRequests) {
      const mods = await this.prisma.councilMember.findMany({
        where: { councilId, role: 'MODERATOR' },
        select: { userId: true, role: true },
      });
      for (const m of mods) {
        if (councilPermissions(council, m.userId, m).canManageRequests) {
          managers.push(m.userId);
        }
      }
    }
    const pending = await this.pendingRequests(councilId);
    for (const userId of managers) {
      this.bridge.toUser(userId, 'council:requests', { councilId, pending });
    }
  }

  emitToCouncil(councilId: string, event: string, data: object) {
    this.bridge.toCouncil(councilId, event, { councilId, ...data });
  }

  emitToUser(userId: string, councilId: string, event: string, data: object) {
    this.bridge.toUser(userId, event, { councilId, ...data });
  }

  // ─── Socket-side presence ────────────────────────────────────────────────

  /**
   * Socket `council:join` gate: council LIVE and the user already joined through REST
   * (member row, not banned / kicked). Returns null when allowed.
   */
  async socketJoinError(
    councilId: string,
    userId: string,
  ): Promise<{ code: string; message: string } | null> {
    const member = await this.prisma.councilMember.findUnique({
      where: { councilId_userId: { councilId, userId } },
      select: {
        role: true,
        kickedUntil: true,
        council: { select: { status: true } },
      },
    });
    if (!member) return { code: 'not_found', message: 'Council not found' };
    if (member.council.status !== 'LIVE') {
      return { code: 'council_ended', message: 'Council ended' };
    }
    if (member.role === 'BANNED') {
      return { code: 'council_banned', message: 'Banned' };
    }
    if (member.kickedUntil && member.kickedUntil > new Date()) {
      return { code: 'council_kicked', message: 'Removed' };
    }
    return null;
  }

  async touch(councilId: string, userId: string) {
    await this.presence.touch(councilId, userId);
    await this.touchHost(councilId, userId);
  }

  /** Keeps `hostLastSeenAt` fresh (at most one write per minute). */
  async touchHost(councilId: string, userId: string) {
    const now = new Date();
    await this.prisma.council
      .updateMany({
        where: {
          id: councilId,
          ownerId: userId,
          status: 'LIVE',
          hostLastSeenAt: { lt: new Date(now.getTime() - HOST_TOUCH_MS) },
        },
        data: { hostLastSeenAt: now },
      })
      .catch(() => {});
  }

  async left(councilId: string, userId: string) {
    await this.presence.remove(councilId, userId);
    await this.emitListenerCount(councilId);
  }
}
