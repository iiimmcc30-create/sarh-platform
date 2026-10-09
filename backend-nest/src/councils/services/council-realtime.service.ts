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
  councilArrivalTier,
  councilPermissions,
  COUNCIL_ARRIVAL_COOLDOWN_SEC,
  COUNCIL_ARRIVAL_GAP_SEC,
  COUNCIL_MAX_SPEAKERS,
} from '../lib/council-policy';

const COUNT_THROTTLE_MS = 2_000;
const HOST_TOUCH_MS = 60_000;
export const COUNCIL_PENDING_REQUESTS_LIMIT = 50;
/** Participants grid page (4 columns × 15 rows). Broadcasts carry the first page only. */
export const COUNCIL_LISTENERS_PAGE = 60;
/** Upper bound of present users considered per page query (very large rooms). */
const COUNCIL_LISTENERS_SCAN_MAX = 5_000;

/** Off-stage participant (a listener, or a moderator who is not on stage). */
export type CouncilListener = {
  userId: string;
  role: string;
  user: CouncilSpeakerRow['user'];
};

export type CouncilListenersPage = {
  listeners: CouncilListener[];
  /** Opaque cursor for the next page (offset); null when this was the last one. */
  nextCursor: string | null;
};

/** «عرض صورة» as every member sees it (null when nothing is shown). */
export type CouncilImage = {
  url: string;
  listingId: string | null;
  listing: { id: string; title: string } | null;
  by: CouncilSpeakerRow['user'] | null;
  at: Date | null;
};

type CouncilImageRow = {
  imageUrl: string | null;
  imageListingId: string | null;
  imageById: string | null;
  imageAt: Date | null;
};

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

  /**
   * Present participants who are not on stage, X Spaces order: moderators first,
   * then listeners by join time. Only users with a live presence heartbeat appear,
   * and only one page is loaded (offset cursor) so big rooms stay cheap.
   */
  async loadListeners(
    councilId: string,
    cursor?: string | null,
    limit = COUNCIL_LISTENERS_PAGE,
  ): Promise<CouncilListenersPage> {
    const offset = Math.max(0, Math.floor(Number(cursor) || 0));
    const take = Math.min(Math.max(1, limit), COUNCIL_LISTENERS_PAGE);
    const present = (await this.presence.presentIds(councilId)).slice(
      0,
      COUNCIL_LISTENERS_SCAN_MAX,
    );
    if (present.length === 0) return { listeners: [], nextCursor: null };
    const rows = await this.prisma.councilMember.findMany({
      where: {
        councilId,
        userId: { in: present },
        seatIndex: null,
        role: { in: ['MODERATOR', 'LISTENER'] },
        OR: [{ kickedUntil: null }, { kickedUntil: { lt: new Date() } }],
      },
      // Enum order: OWNER, MODERATOR, SPEAKER, LISTENER → moderators first.
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }, { userId: 'asc' }],
      skip: offset,
      take: take + 1,
      select: {
        userId: true,
        role: true,
        user: { select: COUNCIL_USER_SELECT },
      },
    });
    const hasMore = rows.length > take;
    return {
      listeners: rows.slice(0, take).map((r) => ({
        userId: r.userId,
        role: r.role,
        user: r.user,
      })),
      nextCursor: hasMore ? String(offset + take) : null,
    };
  }

  /** «عرض صورة»: public shape of the council's current image (poster + listing). */
  async presentImage(
    row: CouncilImageRow | null,
  ): Promise<CouncilImage | null> {
    if (!row?.imageUrl) return null;
    const [by, listing] = await Promise.all([
      row.imageById
        ? this.prisma.user.findUnique({
            where: { id: row.imageById },
            select: COUNCIL_USER_SELECT,
          })
        : null,
      row.imageListingId
        ? this.prisma.listing.findFirst({
            where: {
              id: row.imageListingId,
              status: { in: ['active', 'sold'] },
            },
            select: { id: true, title: true },
          })
        : null,
    ]);
    return {
      url: row.imageUrl,
      listingId: listing?.id ?? null,
      listing: listing ?? null,
      by: by ?? null,
      at: row.imageAt,
    };
  }

  async emitImage(councilId: string, image: CouncilImage | null) {
    this.bridge.toCouncil(councilId, 'council:image', { councilId, image });
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
    const page = await this.loadListeners(councilId);
    this.bridge.toCouncil(councilId, 'council:speakers', {
      councilId,
      speakers,
      speakersCount: speakers.length,
      listenerCount,
      listeners: page.listeners,
      listenersNextCursor: page.nextCursor,
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
    // First page of the participants grid rides along (computed once per throttle
    // window for the whole room, instead of every client refetching it).
    const page = await this.loadListeners(councilId);
    this.bridge.toCouncil(councilId, 'council:listeners', {
      councilId,
      listenerCount,
      listeners: page.listeners,
      listenersNextCursor: page.nextCursor,
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

  /**
   * `council:arrival` — a Gold / Blue+ subscriber entered the room (read-only, public
   * identity fields only). Once per user per council every 10 min (socket reconnects
   * never repeat it) and at most one per council every 3 s. Best effort.
   */
  async announceArrival(councilId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: COUNCIL_USER_SELECT,
    });
    if (!councilArrivalTier(user)) return;
    const first = await this.cache.claimOnce(
      `council:arrival:${councilId}:${userId}`,
      COUNCIL_ARRIVAL_COOLDOWN_SEC,
    );
    if (!first) return;
    const free = await this.cache.claimOnce(
      `council:arrival-gap:${councilId}`,
      COUNCIL_ARRIVAL_GAP_SEC,
    );
    if (!free) return;
    this.bridge.toCouncil(councilId, 'council:arrival', { councilId, user });
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
