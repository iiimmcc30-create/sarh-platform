import { Injectable, Optional } from '@nestjs/common';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma, type Council, type CouncilMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { LoggerService } from '../common/services/logger.service';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  COUNCIL_SPEAKER_PUBLISH_EXPIRE,
  councilIdToChannel,
  generateCouncilToken,
  isAgoraConfigured,
} from '../shared/lib/agora';
import {
  COUNCIL_HOST_ABSENT_END_MS,
  COUNCIL_KICK_MINUTES,
  COUNCIL_MAX_SCHEDULED_PER_OWNER,
  COUNCIL_SCHEDULE_STALE_MS,
  parseCouncilSchedule,
  COUNCIL_MAX_SPEAKERS,
  COUNCIL_REQUEST_COOLDOWN_MS,
  COUNCIL_STALE_SPEAKER_MS,
  canActOn,
  councilPermissions,
  firstFreeSeat,
  roleOffStage,
  roleOnStage,
  rtcRoleFor,
  type CouncilPermissions,
} from './lib/council-policy';
import { COUNCIL_USER_SELECT, type CouncilUser } from './lib/council-select';
import { CouncilPresenceService } from './services/council-presence.service';
import { CouncilRealtimeService } from './services/council-realtime.service';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { SubscriptionEntitlementService } from '../subscriptions/services/subscription-entitlement.service';
import {
  activeSubscriberTier,
  canHostFollowersOnlyCouncils,
  canScheduleCouncils,
  canShowCouncilImages,
} from '../subscriptions/perks/subscriber-perks';
import { isOurUploadUrl } from '../shared/lib/storage';
import { assertUserMediaUrls } from '../shared/lib/media-ownership';
import { isListingVideoUrl } from '../shared/lib/media-url';
import type {
  CouncilImageDto,
  CouncilMemberAction,
  CreateCouncilDto,
  JoinCouncilDto,
  UpdateCouncilDto,
} from './dto/councils.dto';

export const COUNCILS_PAGE_SIZE = 20;
export const COUNCIL_PRIVATE_LIST_LIMIT = 50;
export const COUNCIL_BANNED_LIST_LIMIT = 100;
export const COUNCIL_USERS_SEARCH_LIMIT = 20;
export const COUNCIL_UPCOMING_LIMIT = 30;
/** «عرض صورة» picker: my latest listings with photos. */
export const COUNCIL_IMAGE_SOURCE_LISTINGS = 30;
const COUNCIL_IMAGE_SOURCE_PHOTOS = 8;
const GOLD_ONLY_AR = 'عرض الصور في المجالس متاح لمشتركي Gold';
const BAN_AGORA_SECONDS = 24 * 60 * 60;

const NOT_FOUND_AR = 'المجلس غير موجود';
const FORBIDDEN_AR = 'غير مسموح';
const FULL_AR = 'اكتمل عدد المتحدثين في المجلس';
const NOT_STARTED_AR = 'المجلس لم يبدأ بعد';
const FOLLOWERS_ONLY_AR = 'هذا المجلس لمتابعي المضيف فقط';
const SCHEDULE_ERRORS_AR: Record<string, string> = {
  invalid_schedule: 'موعد المجلس غير صالح',
  schedule_too_soon: 'اختر موعداً بعد ٥ دقائق على الأقل',
  schedule_too_far: 'يمكن جدولة المجلس خلال أسبوعين كحد أقصى',
};

const INVITE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function newCouncilInviteCode(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return out;
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type CouncilWithOwner = Council & { owner: CouncilUser };
type Tx = Prisma.TransactionClient;

const ACTIVE_OWNER: Prisma.UserWhereInput = { isActive: true, deletedAt: null };

@Injectable()
export class CouncilsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly presence: CouncilPresenceService,
    private readonly realtime: CouncilRealtimeService,
    private readonly agoraModeration: CouncilAgoraModerationService,
    private readonly notifications: AppNotificationsService,
    private readonly logger: LoggerService,
    @Optional() private readonly entitlements?: SubscriptionEntitlementService,
  ) {}

  // ─── Subscriber perks ───────────────────────────────────────────────────

  /** Host tier from the ACTIVE subscription (server-side; never the client). */
  private async subscriberTier(userId: string) {
    if (!this.entitlements) return null;
    return activeSubscriberTier(this.entitlements, userId).catch(() => null);
  }

  /** What the create screen may offer (the server re-checks on create). */
  async perks(user: JwtPayload) {
    const tier = await this.subscriberTier(user.userId);
    return {
      tier,
      canFollowersOnly: canHostFollowersOnlyCouncils(tier),
      canSchedule: canScheduleCouncils(tier),
      canShowImages: canShowCouncilImages(tier),
    };
  }

  // ─── Access ─────────────────────────────────────────────────────────────

  /**
   * Loads a council for a viewer. Private councils answer 404 (never 403) unless the
   * viewer is the owner, a member (incl. banned, so they see why), invited, or holds
   * the invite code — so their existence and data never leak.
   */
  private async loadForViewer(id: string, viewerId: string, code?: string) {
    const council = await this.prisma.council.findUnique({
      where: { id },
      include: { owner: { select: COUNCIL_USER_SELECT } },
    });
    if (!council) throwApi(404, 'not_found', NOT_FOUND_AR);
    const member = await this.findMember(this.prisma, id, viewerId);
    if (
      council.visibility === 'PRIVATE' &&
      council.ownerId !== viewerId &&
      !member
    ) {
      const codeOk = Boolean(code) && sameCode(code!, council.inviteCode);
      if (!codeOk) {
        const invite = await this.prisma.councilInvite.findUnique({
          where: { councilId_userId: { councilId: id, userId: viewerId } },
          select: { id: true },
        });
        if (!invite) throwApi(404, 'not_found', NOT_FOUND_AR);
      }
    }
    await this.endIfHostAbsent(council);
    return { council, member };
  }

  private findMember(
    db: Tx | PrismaService,
    councilId: string,
    userId: string,
  ) {
    return db.councilMember.findUnique({
      where: { councilId_userId: { councilId, userId } },
    });
  }

  /** Member gate for in-room actions (404 for non-members so nothing leaks). */
  private assertActiveMember(
    member: CouncilMember | null,
  ): asserts member is CouncilMember {
    if (!member) throwApi(404, 'not_found', NOT_FOUND_AR);
    if (member.role === 'BANNED') {
      throwApi(403, 'council_banned', 'تم حظرك من هذا المجلس');
    }
    if (member.kickedUntil && member.kickedUntil > new Date()) {
      throwApi(403, 'council_kicked', 'تمت إزالتك من المجلس مؤقتاً');
    }
  }

  private assertLive(council: Pick<Council, 'status'>) {
    if (council.status !== 'LIVE') {
      throwApi(410, 'council_ended', 'انتهى المجلس');
    }
  }

  /**
   * Serializes every stage/seat mutation of one council: the council row is locked
   * (SELECT ... FOR UPDATE) so concurrent accepts cannot exceed 12 seats. The unique
   * (councilId, seatIndex) index + CHECK 0..11 are the database backstop.
   */
  private async withCouncilLock<T>(
    councilId: string,
    fn: (tx: Tx, council: Council) => Promise<T>,
    opts: { allowEnded?: boolean } = {},
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Council" WHERE id = ${councilId} FOR UPDATE`;
          if (locked.length === 0) throwApi(404, 'not_found', NOT_FOUND_AR);
          const council = await tx.council.findUniqueOrThrow({
            where: { id: councilId },
          });
          if (!opts.allowEnded) this.assertLive(council);
          return fn(tx, council);
        },
        { maxWait: 10_000, timeout: 15_000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2004')
      ) {
        throwApi(409, 'council_full', FULL_AR);
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2028'
      ) {
        throwApi(503, 'council_busy', 'المجلس مشغول، حاول مرة أخرى');
      }
      throw err;
    }
  }

  /** Puts a member on stage (lowest free seat). Must run inside withCouncilLock. */
  private async takeSeat(
    tx: Tx,
    councilId: string,
    member: CouncilMember,
  ): Promise<number> {
    if (member.seatIndex !== null) return member.seatIndex;
    const taken = await tx.councilMember.findMany({
      where: { councilId, seatIndex: { not: null } },
      select: { seatIndex: true },
    });
    const seat = firstFreeSeat(taken.map((t) => t.seatIndex));
    if (seat === null) throwApi(409, 'council_full', FULL_AR);
    await tx.councilMember.update({
      where: { id: member.id },
      data: {
        seatIndex: seat,
        role: roleOnStage(member.role),
        micMuted: true,
        mutedByModerator: false,
      },
    });
    await tx.councilSpeakRequest.updateMany({
      where: { councilId, userId: member.userId, status: 'PENDING' },
      data: { status: 'ACCEPTED', decidedAt: new Date() },
    });
    return seat;
  }

  // ─── Presenters ─────────────────────────────────────────────────────────

  private presentMeta(council: CouncilWithOwner, perms: CouncilPermissions) {
    return {
      id: council.id,
      name: council.name,
      description: council.description,
      rules: council.rules,
      visibility: council.visibility,
      status: council.status,
      followersOnly: council.followersOnly,
      scheduledFor: council.scheduledFor,
      createdAt: council.createdAt,
      startedAt: council.startedAt,
      endedAt: council.endedAt,
      owner: council.owner,
      maxSpeakers: COUNCIL_MAX_SPEAKERS,
      moderatorPermissions: {
        canManageRequests: council.modCanManageRequests,
        canMute: council.modCanMute,
        canRemove: council.modCanRemove,
        canBan: council.modCanBan,
      },
      ...(perms.canInvite ? { inviteCode: council.inviteCode } : {}),
    };
  }

  /** Everything a room screen needs — never the listener list. */
  async buildState(
    council: CouncilWithOwner,
    viewerId: string,
    member: CouncilMember | null,
  ) {
    const perms = councilPermissions(council, viewerId, member);
    const live = council.status === 'LIVE';
    const speakers = live ? await this.realtime.loadSpeakers(council.id) : [];
    const listenerCount = live
      ? await this.realtime.listenerCount(council.id, speakers)
      : 0;
    const pendingRequests =
      live && perms.canManageRequests
        ? await this.realtime.pendingRequests(council.id)
        : [];
    const myRequest =
      live && member
        ? await this.prisma.councilSpeakRequest.findFirst({
            where: {
              councilId: council.id,
              userId: viewerId,
              status: 'PENDING',
            },
            select: { id: true },
          })
        : null;
    const listenersPage = live
      ? await this.realtime.loadListeners(council.id)
      : { listeners: [], nextCursor: null };
    const image = live ? await this.realtime.presentImage(council) : null;
    const now = new Date();
    const activeMember =
      Boolean(member) &&
      member!.role !== 'BANNED' &&
      !(member!.kickedUntil && member!.kickedUntil > now);
    const canShowImage =
      live &&
      activeMember &&
      (perms.isOwner || member!.seatIndex !== null) &&
      canShowCouncilImages(await this.subscriberTier(viewerId));
    return {
      council: this.presentMeta(council, perms),
      speakers,
      speakersCount: speakers.length,
      listenerCount,
      /** Off-stage participants (first page; more via GET :id/listeners). */
      listeners: listenersPage.listeners,
      listenersNextCursor: listenersPage.nextCursor,
      /** «عرض صورة»: the image pinned at the top of the room, or null. */
      image,
      isFull: speakers.length >= COUNCIL_MAX_SPEAKERS,
      me: {
        userId: viewerId,
        role: member?.role ?? null,
        joined: Boolean(member) && member!.role !== 'BANNED',
        banned: member?.role === 'BANNED',
        kickedUntil:
          member?.kickedUntil && member.kickedUntil > now
            ? member.kickedUntil
            : null,
        seatIndex: member?.seatIndex ?? null,
        onStage: member?.seatIndex !== null && member?.seatIndex !== undefined,
        micMuted: member?.micMuted ?? true,
        mutedByModerator: member?.mutedByModerator ?? false,
        rulesAccepted:
          council.rules.length === 0 || Boolean(member?.rulesAcceptedAt),
        pendingRequestId: myRequest?.id ?? null,
        rtcRole: rtcRoleFor(member),
        permissions: perms,
        /** Gold owner / speaker on stage may use «عرض صورة» (server re-checks). */
        canShowImage,
      },
      pendingRequests,
    };
  }

  /** Role-based Agora credentials; `agora: null` when Agora is not configured. */
  private credentials(
    councilId: string,
    userId: string,
    member: CouncilMember,
  ) {
    if (!isAgoraConfigured()) {
      return { agora: null, agoraError: 'agora_unavailable' as const };
    }
    const t = generateCouncilToken(councilId, userId, rtcRoleFor(member));
    return {
      agora: {
        appId: process.env.AGORA_APP_ID as string,
        channel: t.channel,
        token: t.token,
        uid: t.uid,
        role: t.role,
        expiresIn: t.expiresIn,
        publishExpiresIn: t.publishExpiresIn,
      },
      agoraError: null,
    };
  }

  // ─── Create / read ──────────────────────────────────────────────────────

  async create(user: JwtPayload, dto: CreateCouncilDto) {
    const id = randomUUID();
    const now = new Date();
    // Subscriber options are gated here, on the server.
    const wantsFollowersOnly =
      dto.followersOnly === true && dto.visibility === 'PUBLIC';
    let scheduledFor: Date | null = null;
    if (dto.scheduledFor || wantsFollowersOnly) {
      const tier = await this.subscriberTier(user.userId);
      if (wantsFollowersOnly && !canHostFollowersOnlyCouncils(tier)) {
        throwApi(403, 'perk_required', 'مجالس المتابعين متاحة لمشتركي Gold');
      }
      if (dto.scheduledFor) {
        if (!canScheduleCouncils(tier)) {
          throwApi(
            403,
            'perk_required',
            'جدولة المجالس متاحة لمشتركي Blue+ وGold',
          );
        }
        const parsed = parseCouncilSchedule(dto.scheduledFor, now);
        if (typeof parsed === 'string') {
          throwApi(400, parsed, SCHEDULE_ERRORS_AR[parsed]);
        }
        scheduledFor = parsed;
      }
    }
    await this.prisma.$transaction(async (tx) => {
      // One LIVE council per owner (lock the owner row against double-submit).
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${user.userId} FOR UPDATE`;
      if (scheduledFor) {
        const upcoming = await tx.council.count({
          where: { ownerId: user.userId, status: 'SCHEDULED' },
        });
        if (upcoming >= COUNCIL_MAX_SCHEDULED_PER_OWNER) {
          throwApi(
            409,
            'council_schedule_limit',
            `يمكنك جدولة ${COUNCIL_MAX_SCHEDULED_PER_OWNER} مجالس كحد أقصى`,
          );
        }
      } else {
        const existing = await tx.council.findFirst({
          where: { ownerId: user.userId, status: 'LIVE' },
          select: { id: true },
        });
        if (existing) {
          throwApi(409, 'council_exists', 'لديك مجلس مباشر بالفعل', {
            councilId: existing.id,
          });
        }
      }
      await tx.council.create({
        data: {
          id,
          ownerId: user.userId,
          name: dto.name,
          description: dto.description ? dto.description : null,
          visibility: dto.visibility,
          followersOnly: wantsFollowersOnly,
          ...(scheduledFor
            ? {
                status: 'SCHEDULED' as const,
                scheduledFor,
                startedAt: scheduledFor,
              }
            : {}),
          rules: dto.rules ?? [],
          agoraChannelName: councilIdToChannel(id),
          inviteCode: newCouncilInviteCode(),
          ...(dto.modCanManageRequests !== undefined
            ? { modCanManageRequests: dto.modCanManageRequests }
            : {}),
          ...(dto.modCanMute !== undefined
            ? { modCanMute: dto.modCanMute }
            : {}),
          ...(dto.modCanRemove !== undefined
            ? { modCanRemove: dto.modCanRemove }
            : {}),
          ...(dto.modCanBan !== undefined ? { modCanBan: dto.modCanBan } : {}),
          members: {
            create: {
              userId: user.userId,
              role: 'OWNER',
              seatIndex: 0,
              micMuted: false,
              rulesAcceptedAt: new Date(),
            },
          },
        },
      });
    });
    this.logger.info(
      { councilId: id, userId: user.userId, scheduled: Boolean(scheduledFor) },
      'Council created',
    );
    const { council, member } = await this.loadForViewer(id, user.userId);
    if (scheduledFor) {
      return {
        state: await this.buildState(council, user.userId, member),
        agora: null,
        agoraError: 'council_scheduled' as const,
      };
    }
    return {
      state: await this.buildState(council, user.userId, member),
      ...this.credentials(id, user.userId, member!),
    };
  }

  async getState(user: JwtPayload, id: string, code?: string) {
    const { council, member } = await this.loadForViewer(id, user.userId, code);
    if (council.status === 'LIVE') {
      if (council.ownerId === user.userId) {
        await this.realtime.touchHost(id, user.userId);
      }
      if (await this.cache.claimOnce(`council:sweep:${id}`, 15)) {
        await this.sweepStaleSpeakers(id);
      }
    }
    return this.buildState(council, user.userId, member);
  }

  async join(user: JwtPayload, id: string, dto: JoinCouncilDto) {
    const { council, member } = await this.loadForViewer(
      id,
      user.userId,
      dto.code,
    );
    if (council.status === 'SCHEDULED') {
      throwApi(409, 'council_not_started', NOT_STARTED_AR, {
        scheduledFor: council.scheduledFor,
      });
    }
    this.assertLive(council);
    await this.assertFollowersOnlyAccess(council, user.userId, member);
    if (member?.role === 'BANNED') {
      throwApi(403, 'council_banned', 'تم حظرك من هذا المجلس');
    }
    if (member?.kickedUntil && member.kickedUntil > new Date()) {
      throwApi(403, 'council_kicked', 'تمت إزالتك من المجلس مؤقتاً');
    }
    const needsRules = council.rules.length > 0 && !member?.rulesAcceptedAt;
    if (needsRules && dto.acceptRules !== true) {
      throwApi(
        412,
        'rules_required',
        'يجب الموافقة على قواعد المجلس للانضمام',
        { rules: council.rules },
      );
    }
    let joined: CouncilMember;
    try {
      joined = await this.prisma.councilMember.upsert({
        where: { councilId_userId: { councilId: id, userId: user.userId } },
        create: {
          councilId: id,
          userId: user.userId,
          role: 'LISTENER',
          rulesAcceptedAt: new Date(),
        },
        update: needsRules ? { rulesAcceptedAt: new Date() } : {},
      });
    } catch (err) {
      // Concurrent first join from two devices: the other request created the row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        joined = (await this.findMember(this.prisma, id, user.userId))!;
      } else {
        throw err;
      }
    }
    if (council.ownerId === user.userId) {
      await this.realtime.touchHost(id, user.userId);
    }
    return {
      state: await this.buildState(council, user.userId, joined),
      ...this.credentials(id, user.userId, joined),
    };
  }

  /** Fresh Agora token for the member's CURRENT database role (used for renewal). */
  async token(user: JwtPayload, id: string) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    this.assertLive(council);
    this.assertActiveMember(member);
    const creds = this.credentials(id, user.userId, member);
    if (!creds.agora) {
      throwApi(503, 'agora_unavailable', 'الصوت غير متاح حالياً');
    }
    if (council.ownerId === user.userId) {
      await this.realtime.touchHost(id, user.userId);
    }
    return {
      ...creds.agora,
      seatIndex: member.seatIndex,
      micMuted: member.micMuted,
      mutedByModerator: member.mutedByModerator,
      memberRole: member.role,
    };
  }

  async list(user: JwtPayload, cursor?: string) {
    await this.endAbsentHosts();
    await this.startDueScheduled().catch(() => 0);
    const rows = await this.prisma.council.findMany({
      where: {
        status: 'LIVE',
        visibility: 'PUBLIC',
        owner: {
          ...ACTIVE_OWNER,
          blocksInitiated: { none: { blockedId: user.userId } },
          blocksReceived: { none: { blockerId: user.userId } },
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: COUNCILS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: this.listInclude(),
    });
    const hasMore = rows.length > COUNCILS_PAGE_SIZE;
    const page = rows.slice(0, COUNCILS_PAGE_SIZE);
    return {
      councils: await Promise.all(
        page.map((c) => this.presentCard(c, user.userId)),
      ),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  /** Private councils the viewer can enter + the viewer's own live council. */
  async accessible(user: JwtPayload) {
    const uid = user.userId;
    const rows = await this.prisma.council.findMany({
      where: {
        status: 'LIVE',
        owner: ACTIVE_OWNER,
        OR: [
          { ownerId: uid },
          {
            visibility: 'PRIVATE',
            members: { some: { userId: uid, role: { not: 'BANNED' } } },
          },
          {
            visibility: 'PRIVATE',
            invites: { some: { userId: uid } },
            members: { none: { userId: uid, role: 'BANNED' } },
          },
        ],
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: COUNCIL_PRIVATE_LIST_LIMIT,
      include: this.listInclude(),
    });
    const cards = await Promise.all(rows.map((c) => this.presentCard(c, uid)));
    return {
      mine: cards.find((c) => c.isOwner) ?? null,
      private: cards.filter((c) => c.visibility === 'PRIVATE' && !c.isOwner),
    };
  }

  private listInclude() {
    return {
      owner: { select: COUNCIL_USER_SELECT },
      members: {
        where: { seatIndex: { not: null } },
        orderBy: { seatIndex: 'asc' as const },
        take: 4,
        select: { user: { select: COUNCIL_USER_SELECT } },
      },
      _count: {
        select: { members: { where: { seatIndex: { not: null } } } },
      },
    } satisfies Prisma.CouncilInclude;
  }

  private async presentCard(
    c: Prisma.CouncilGetPayload<{
      include: ReturnType<CouncilsService['listInclude']>;
    }>,
    viewerId: string,
  ) {
    const present = await this.presence.count(c.id);
    const speakersCount = c._count.members;
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      visibility: c.visibility,
      followersOnly: c.followersOnly,
      status: c.status,
      startedAt: c.startedAt,
      owner: c.owner,
      speakersPreview: c.members.map((m) => m.user),
      speakersCount,
      listenerCount: Math.max(0, present - speakersCount),
      isOwner: c.ownerId === viewerId,
    };
  }

  /**
   * «للمتابعين فقط»: the host, the host's moderators and invited users always
   * pass; everyone else must follow the host (checked on every join).
   */
  private async assertFollowersOnlyAccess(
    council: Council,
    userId: string,
    member: CouncilMember | null,
  ) {
    if (!council.followersOnly || council.ownerId === userId) return;
    if (member?.role === 'MODERATOR') return;
    const [follow, invite] = await Promise.all([
      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: council.ownerId,
          },
        },
        select: { id: true },
      }),
      this.prisma.councilInvite.findUnique({
        where: { councilId_userId: { councilId: council.id, userId } },
        select: { id: true },
      }),
    ]);
    if (!follow && !invite) {
      throwApi(403, 'council_followers_only', FOLLOWERS_ONLY_AR, {
        hostId: council.ownerId,
      });
    }
  }

  // ─── Scheduled councils («قادمة») ───────────────────────────────────────

  /** Upcoming councils: public ones + the viewer's own (any visibility). */
  async upcoming(user: JwtPayload) {
    void this.startDueScheduled().catch(() => {});
    const uid = user.userId;
    const rows = await this.prisma.council.findMany({
      where: {
        status: 'SCHEDULED',
        OR: [{ visibility: 'PUBLIC' }, { ownerId: uid }],
        owner: {
          ...ACTIVE_OWNER,
          blocksInitiated: { none: { blockedId: uid } },
          blocksReceived: { none: { blockerId: uid } },
        },
      },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: COUNCIL_UPCOMING_LIMIT,
      include: {
        owner: { select: COUNCIL_USER_SELECT },
        reminders: { where: { userId: uid }, select: { id: true } },
        _count: { select: { reminders: true } },
      },
    });
    return {
      councils: rows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        visibility: c.visibility,
        followersOnly: c.followersOnly,
        status: c.status,
        scheduledFor: c.scheduledFor,
        owner: c.owner,
        isOwner: c.ownerId === uid,
        remindMe: c.reminders.length > 0,
        reminderCount: c._count.reminders,
      })),
    };
  }

  /** «ذكّرني» on / off for a scheduled council the viewer can see. */
  async remind(user: JwtPayload, id: string, on: boolean) {
    const { council } = await this.loadForViewer(id, user.userId);
    if (council.status !== 'SCHEDULED') {
      throwApi(409, 'council_not_scheduled', 'المجلس ليس مجدولاً');
    }
    if (council.ownerId !== user.userId) {
      if (on) {
        await this.prisma.councilReminder.upsert({
          where: { councilId_userId: { councilId: id, userId: user.userId } },
          create: { councilId: id, userId: user.userId },
          update: {},
        });
      } else {
        await this.prisma.councilReminder.deleteMany({
          where: { councilId: id, userId: user.userId },
        });
      }
    }
    const reminderCount = await this.prisma.councilReminder.count({
      where: { councilId: id },
    });
    return {
      remindMe: council.ownerId !== user.userId && on,
      reminderCount,
    };
  }

  /** Host starts a scheduled council now (early or late). */
  async start(user: JwtPayload, id: string) {
    const { council } = await this.loadForViewer(id, user.userId);
    if (council.ownerId !== user.userId) {
      throwApi(403, 'forbidden', FORBIDDEN_AR);
    }
    if (council.status === 'LIVE') {
      const member = await this.findMember(this.prisma, id, user.userId);
      return {
        state: await this.buildState(council, user.userId, member),
        ...this.credentials(id, user.userId, member!),
      };
    }
    if (council.status !== 'SCHEDULED') this.assertLive(council);
    const started = await this.goLive(id, council.ownerId);
    if (started === 'busy') {
      const existing = await this.prisma.council.findFirst({
        where: { ownerId: user.userId, status: 'LIVE' },
        select: { id: true },
      });
      throwApi(409, 'council_exists', 'لديك مجلس مباشر بالفعل', {
        councilId: existing?.id,
      });
    }
    await this.notifyReminders(id);
    await this.realtime.touchHost(id, user.userId);
    const fresh = await this.loadForViewer(id, user.userId);
    return {
      state: await this.buildState(fresh.council, user.userId, fresh.member),
      ...this.credentials(id, user.userId, fresh.member!),
    };
  }

  /**
   * SCHEDULED → LIVE under the owner-row lock (one LIVE council per owner).
   * Returns 'started', 'busy' (owner already live) or 'gone' (not scheduled).
   */
  private async goLive(
    id: string,
    ownerId: string,
  ): Promise<'started' | 'busy' | 'gone'> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
      const live = await tx.council.findFirst({
        where: { ownerId, status: 'LIVE' },
        select: { id: true },
      });
      if (live) return 'busy';
      const now = new Date();
      const { count } = await tx.council.updateMany({
        where: { id, ownerId, status: 'SCHEDULED' },
        data: { status: 'LIVE', startedAt: now, hostLastSeenAt: now },
      });
      return count > 0 ? 'started' : 'gone';
    });
  }

  /** Tells «ذكّرني» users the council is live (exactly once per council). */
  private async notifyReminders(id: string) {
    const { count } = await this.prisma.council.updateMany({
      where: { id, remindersSentAt: null },
      data: { remindersSentAt: new Date() },
    });
    if (count === 0) return 0;
    const council = await this.prisma.council.findUnique({
      where: { id },
      select: { name: true, ownerId: true },
    });
    if (!council) return 0;
    const rows = await this.prisma.councilReminder.findMany({
      where: {
        councilId: id,
        user: {
          ...ACTIVE_OWNER,
          blocksInitiated: { none: { blockedId: council.ownerId } },
          blocksReceived: { none: { blockerId: council.ownerId } },
        },
      },
      select: { userId: true },
      take: 5000,
    });
    const userIds = rows
      .map((r) => r.userId)
      .filter((u) => u !== council.ownerId);
    if (userIds.length > 0) {
      await this.notifications
        .notifyUsers(userIds, {
          type: 'system',
          titleAr: 'بدأ المجلس',
          bodyAr: `«${council.name}» مباشر الآن، انضم واستمع`,
          data: { kind: 'council_live', councilId: id },
        })
        .catch(() => {});
    }
    return userIds.length;
  }

  /**
   * Starts scheduled councils whose time has come (called by the council
   * scheduler every 30 s and lazily from the lists). Runs once per tick across
   * instances (Redis claim); every transition is also guarded in SQL, so a
   * double run can never start or notify twice. Host already live elsewhere:
   * the council waits (host nudged once) until the host starts it.
   */
  async startDueScheduled(now = new Date()): Promise<number> {
    if (!(await this.cache.claimOnce('council:start-due', 20))) return 0;
    const due = await this.prisma.council.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
      take: 25,
      select: { id: true, ownerId: true, name: true, scheduledFor: true },
    });
    let started = 0;
    for (const c of due) {
      try {
        if (
          c.scheduledFor &&
          c.scheduledFor.getTime() < now.getTime() - COUNCIL_SCHEDULE_STALE_MS
        ) {
          await this.endCouncil(c.id);
          continue;
        }
        const result = await this.goLive(c.id, c.ownerId);
        if (result === 'started') {
          started++;
          this.logger.info({ councilId: c.id }, 'Scheduled council started');
          await this.notifications
            .notifyUser({
              userId: c.ownerId,
              type: 'system',
              titleAr: 'حان موعد مجلسك',
              bodyAr: `«${c.name}» بدأ الآن، ادخل لإدارته`,
              data: { kind: 'council_live', councilId: c.id },
            })
            .catch(() => {});
          await this.notifyReminders(c.id);
        } else if (
          result === 'busy' &&
          (await this.cache.claimOnce(`council:host-nudge:${c.id}`, 24 * 3600))
        ) {
          await this.notifications
            .notifyUser({
              userId: c.ownerId,
              type: 'system',
              titleAr: 'حان موعد مجلسك',
              bodyAr: `أنهِ مجلسك الحالي ثم ابدأ «${c.name}»`,
              // Still SCHEDULED: the app opens the councils list («قادمة» → ابدأ الآن).
              data: { kind: 'council_scheduled_due', councilId: c.id },
            })
            .catch(() => {});
        }
      } catch (err) {
        this.logger.warn(
          {
            councilId: c.id,
            err: err instanceof Error ? err.message : String(err),
          },
          'Scheduled council start failed',
        );
      }
    }
    return started;
  }

  async resolveInvite(user: JwtPayload, code: string) {
    const council = await this.prisma.council.findUnique({
      where: { inviteCode: code },
      select: { id: true, status: true },
    });
    if (!council || council.status !== 'LIVE') {
      throwApi(404, 'not_found', NOT_FOUND_AR);
    }
    return { councilId: council.id, code };
  }

  // ─── Owner management ───────────────────────────────────────────────────

  async update(user: JwtPayload, id: string, dto: UpdateCouncilDto) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    const perms = councilPermissions(council, user.userId, member);
    if (!perms.canEdit) throwApi(403, 'forbidden', FORBIDDEN_AR);
    this.assertLive(council);
    const data: Prisma.CouncilUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined)
      data.description = dto.description || null;
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.rules !== undefined) data.rules = dto.rules;
    if (dto.modCanManageRequests !== undefined) {
      data.modCanManageRequests = dto.modCanManageRequests;
    }
    if (dto.modCanMute !== undefined) data.modCanMute = dto.modCanMute;
    if (dto.modCanRemove !== undefined) data.modCanRemove = dto.modCanRemove;
    if (dto.modCanBan !== undefined) data.modCanBan = dto.modCanBan;
    await this.prisma.council.update({ where: { id }, data });
    this.realtime.emitToCouncil(id, 'council:updated', {});
    if (dto.modCanManageRequests !== undefined) {
      await this.realtime.emitRequests(id);
    }
    return this.getState(user, id);
  }

  async end(user: JwtPayload, id: string) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    if (!councilPermissions(council, user.userId, member).canEnd) {
      throwApi(403, 'forbidden', FORBIDDEN_AR);
    }
    const endedAt = await this.endCouncil(id);
    return { ended: true, endedAt: endedAt ?? council.endedAt };
  }

  /** Ends a council (idempotent). Returns endedAt when this call ended it. */
  private async endCouncil(id: string): Promise<Date | null> {
    const endedAt = await this.withCouncilLock(
      id,
      async (tx, council) => {
        if (council.status === 'ENDED') return null;
        const now = new Date();
        await tx.council.update({
          where: { id },
          data: { status: 'ENDED', endedAt: now },
        });
        await tx.councilMember.updateMany({
          where: { councilId: id, seatIndex: { not: null } },
          data: { seatIndex: null, micMuted: true },
        });
        await tx.councilSpeakRequest.updateMany({
          where: { councilId: id, status: 'PENDING' },
          data: { status: 'CANCELLED', decidedAt: now },
        });
        return now;
      },
      { allowEnded: true },
    );
    if (endedAt) {
      this.realtime.emitToCouncil(id, 'council:ended', { endedAt });
      await this.presence.clear(id);
      this.logger.info({ councilId: id }, 'Council ended');
    }
    return endedAt;
  }

  /** Owner gone (no heartbeat / API call) for 30 min → the council ends by itself. */
  private async endIfHostAbsent(council: Council) {
    if (council.status !== 'LIVE') return;
    if (
      council.hostLastSeenAt.getTime() >
      Date.now() - COUNCIL_HOST_ABSENT_END_MS
    ) {
      return;
    }
    const endedAt = await this.endCouncil(council.id);
    council.status = 'ENDED';
    council.endedAt = endedAt ?? new Date();
  }

  private async endAbsentHosts() {
    if (!(await this.cache.claimOnce('council:end-absent-hosts', 60))) return;
    const stale = await this.prisma.council.findMany({
      where: {
        status: 'LIVE',
        hostLastSeenAt: {
          lt: new Date(Date.now() - COUNCIL_HOST_ABSENT_END_MS),
        },
      },
      select: { id: true },
      take: 50,
    });
    for (const c of stale) {
      await this.endCouncil(c.id).catch(() => null);
    }
  }

  async rotateInvite(user: JwtPayload, id: string) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    if (!councilPermissions(council, user.userId, member).canEdit) {
      throwApi(403, 'forbidden', FORBIDDEN_AR);
    }
    const inviteCode = newCouncilInviteCode();
    await this.prisma.council.update({ where: { id }, data: { inviteCode } });
    return { inviteCode };
  }

  async invite(user: JwtPayload, id: string, userIds: string[]) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    if (!councilPermissions(council, user.userId, member).canInvite) {
      throwApi(403, 'forbidden', FORBIDDEN_AR);
    }
    this.assertLive(council);
    const wanted = [...new Set(userIds)].filter((u) => u !== user.userId);
    if (wanted.length === 0) return { invited: 0 };
    const [users, banned, already] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: wanted }, ...ACTIVE_OWNER },
        select: { id: true },
      }),
      this.prisma.councilMember.findMany({
        where: { councilId: id, userId: { in: wanted }, role: 'BANNED' },
        select: { userId: true },
      }),
      this.prisma.councilInvite.findMany({
        where: { councilId: id, userId: { in: wanted } },
        select: { userId: true },
      }),
    ]);
    const skip = new Set([
      ...banned.map((b) => b.userId),
      ...already.map((a) => a.userId),
    ]);
    const fresh = users.map((u) => u.id).filter((u) => !skip.has(u));
    if (fresh.length > 0) {
      await this.prisma.councilInvite.createMany({
        data: fresh.map((userId) => ({
          councilId: id,
          userId,
          invitedById: user.userId,
        })),
        skipDuplicates: true,
      });
      const inviter = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { arabicName: true, displayName: true, username: true },
      });
      const name =
        inviter?.arabicName || inviter?.displayName || inviter?.username || '';
      void this.notifications
        .notifyUsers(fresh, {
          type: 'system',
          titleAr: 'دعوة إلى مجلس',
          bodyAr: `${name} يدعوك للانضمام إلى «${council.name}»`,
          data: { kind: 'council_invite', councilId: id },
        })
        .catch(() => {});
    }
    return { invited: fresh.length };
  }

  async banned(user: JwtPayload, id: string) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    if (!councilPermissions(council, user.userId, member).canBan) {
      throwApi(403, 'forbidden', FORBIDDEN_AR);
    }
    const rows = await this.prisma.councilMember.findMany({
      where: { councilId: id, role: 'BANNED' },
      orderBy: { bannedAt: 'desc' },
      take: COUNCIL_BANNED_LIST_LIMIT,
      select: { bannedAt: true, user: { select: COUNCIL_USER_SELECT } },
    });
    return { banned: rows };
  }

  async searchUsers(user: JwtPayload, q?: string) {
    const term = (q ?? '').trim().replace(/^@/, '');
    if (!term) return { users: [] };
    const users = await this.prisma.user.findMany({
      where: {
        ...ACTIVE_OWNER,
        id: { not: user.userId },
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { arabicName: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ verified: 'desc' }, { username: 'asc' }],
      take: COUNCIL_USERS_SEARCH_LIMIT,
      select: COUNCIL_USER_SELECT,
    });
    return { users };
  }

  // ─── Member self-actions ────────────────────────────────────────────────

  // ─── Participants grid ─────────────────────────────────────────────────

  /** Next page of off-stage participants (members of the room only). */
  async listeners(user: JwtPayload, id: string, cursor?: string) {
    const { council, member } = await this.loadForViewer(id, user.userId);
    this.assertActiveMember(member);
    if (council.status !== 'LIVE') return { listeners: [], nextCursor: null };
    return this.realtime.loadListeners(id, cursor);
  }

  // ─── «عرض صورة» (Gold) ─────────────────────────────────────────────────

  /** Photos from my own listings for the «عرض صورة» picker. */
  async imageSources(user: JwtPayload) {
    const tier = await this.subscriberTier(user.userId);
    const rows = await this.prisma.listing.findMany({
      where: { sellerId: user.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: COUNCIL_IMAGE_SOURCE_LISTINGS,
      select: { id: true, title: true, images: true, thumbnailUrl: true },
    });
    const listings = rows
      .map((l) => ({
        id: l.id,
        title: l.title,
        images: (l.images ?? [])
          .filter((u) => typeof u === 'string' && u && !isListingVideoUrl(u))
          .slice(0, COUNCIL_IMAGE_SOURCE_PHOTOS),
      }))
      .filter((l) => l.images.length > 0);
    return { canShowImages: canShowCouncilImages(tier), listings };
  }

  /**
   * Pins an image at the top of the room. Server-side rules: active Gold
   * subscription, the owner or a member on stage, an image we host (our upload
   * storage), and for a listing photo the listing must be mine and contain it.
   * The owner may replace anyone's image; others only an empty slot or their own.
   */
  async showImage(user: JwtPayload, id: string, dto: CouncilImageDto) {
    const tier = await this.subscriberTier(user.userId);
    if (!canShowCouncilImages(tier)) {
      throwApi(403, 'council_image_gold_only', GOLD_ONLY_AR);
    }
    const url = dto.imageUrl.trim();
    if (!isOurUploadUrl(url) || isListingVideoUrl(url)) {
      throwApi(400, 'invalid_image', 'الصورة غير صالحة');
    }
    let listingId: string | null = null;
    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: {
          id: dto.listingId,
          sellerId: user.userId,
          status: { in: ['active', 'sold'] },
        },
        select: { id: true, images: true, thumbnailUrl: true },
      });
      const photos = [...(listing?.images ?? []), listing?.thumbnailUrl];
      if (!listing || !photos.includes(url)) {
        throwApi(400, 'invalid_image', 'الصورة غير موجودة في إعلانك');
      }
      listingId = listing.id;
    } else {
      // Gallery upload: must be the user's own upload, within size/format.
      await assertUserMediaUrls([url], user.userId);
    }
    const updated = await this.withCouncilLock(id, async (tx, council) => {
      const member = await this.findMember(tx, id, user.userId);
      this.assertActiveMember(member);
      const isOwner = council.ownerId === user.userId;
      if (!isOwner && member.seatIndex === null) {
        throwApi(403, 'forbidden', 'عرض الصور متاح للمضيف والمتحدثين');
      }
      if (
        !isOwner &&
        council.imageUrl &&
        council.imageById &&
        council.imageById !== user.userId
      ) {
        throwApi(409, 'council_image_busy', 'تُعرض صورة حالياً في المجلس');
      }
      return tx.council.update({
        where: { id },
        data: {
          imageUrl: url,
          imageListingId: listingId,
          imageById: user.userId,
          imageAt: new Date(),
        },
        select: {
          imageUrl: true,
          imageListingId: true,
          imageById: true,
          imageAt: true,
        },
      });
    });
    const image = await this.realtime.presentImage(updated);
    await this.realtime.emitImage(id, image);
    return { image };
  }

  /** Removes the image: the owner, a moderator who may remove members, or its poster. */
  async removeImage(user: JwtPayload, id: string) {
    const removed = await this.withCouncilLock(
      id,
      async (tx, council) => {
        if (!council.imageUrl) return false;
        const member = await this.findMember(tx, id, user.userId);
        const perms = councilPermissions(council, user.userId, member);
        const isPoster =
          Boolean(member) &&
          member!.role !== 'BANNED' &&
          council.imageById === user.userId;
        if (
          !perms.isOwner &&
          !(perms.isModerator && perms.canRemove) &&
          !isPoster
        ) {
          if (!member || member.role === 'BANNED') {
            throwApi(404, 'not_found', NOT_FOUND_AR);
          }
          throwApi(403, 'forbidden', FORBIDDEN_AR);
        }
        await tx.council.update({
          where: { id },
          data: {
            imageUrl: null,
            imageListingId: null,
            imageById: null,
            imageAt: null,
          },
        });
        return true;
      },
      { allowEnded: true },
    );
    if (removed) await this.realtime.emitImage(id, null);
    return { removed };
  }

  async leave(user: JwtPayload, id: string) {
    const member = await this.findMember(this.prisma, id, user.userId);
    if (!member) return { left: true };
    let stageChanged = false;
    let cancelled = 0;
    const council = await this.prisma.council.findUnique({
      where: { id },
      select: { status: true },
    });
    if (council?.status === 'LIVE') {
      const result = await this.withCouncilLock(id, async (tx) => {
        const fresh = await this.findMember(tx, id, user.userId);
        let changed = false;
        if (fresh && fresh.role !== 'OWNER' && fresh.seatIndex !== null) {
          await tx.councilMember.update({
            where: { id: fresh.id },
            data: {
              seatIndex: null,
              role: roleOffStage(fresh.role),
              micMuted: true,
            },
          });
          changed = true;
        }
        const { count } = await tx.councilSpeakRequest.updateMany({
          where: { councilId: id, userId: user.userId, status: 'PENDING' },
          data: { status: 'CANCELLED', decidedAt: new Date() },
        });
        return { changed, count };
      });
      stageChanged = result.changed;
      cancelled = result.count;
    }
    await this.presence.remove(id, user.userId);
    if (stageChanged) await this.realtime.emitSpeakers(id);
    else await this.realtime.emitListenerCount(id);
    if (cancelled > 0) await this.realtime.emitRequests(id);
    return { left: true };
  }

  async setMic(user: JwtPayload, id: string, muted: boolean) {
    const member = await this.findMember(this.prisma, id, user.userId);
    this.assertActiveMember(member);
    const council = await this.prisma.council.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    this.assertLive(council);
    if (member.seatIndex === null) {
      throwApi(403, 'not_on_stage', 'لست ضمن المتحدثين');
    }
    const { count } = await this.prisma.councilMember.updateMany({
      where: {
        id: member.id,
        seatIndex: { not: null },
        ...(muted ? {} : { mutedByModerator: false }),
      },
      data: { micMuted: muted },
    });
    if (count === 0) {
      const fresh = await this.findMember(this.prisma, id, user.userId);
      if (fresh?.mutedByModerator) {
        throwApi(403, 'muted_by_moderator', 'تم كتمك من قبل إدارة المجلس');
      }
      throwApi(403, 'not_on_stage', 'لست ضمن المتحدثين');
    }
    this.realtime.emitToCouncil(id, 'council:mic', {
      userId: user.userId,
      micMuted: muted,
      mutedByModerator: false,
    });
    return { micMuted: muted };
  }

  async leaveStage(user: JwtPayload, id: string) {
    const out = await this.withCouncilLock(id, async (tx) => {
      const member = await this.findMember(tx, id, user.userId);
      this.assertActiveMember(member);
      if (member.role === 'OWNER') {
        throwApi(400, 'owner_stays_on_stage', 'راعي المجلس يبقى ضمن المتحدثين');
      }
      if (member.seatIndex === null) return null;
      return tx.councilMember.update({
        where: { id: member.id },
        data: {
          seatIndex: null,
          role: roleOffStage(member.role),
          micMuted: true,
        },
      });
    });
    if (out) {
      await this.realtime.emitSpeakers(id);
      this.realtime.emitToUser(user.userId, id, 'council:role', {
        role: out.role,
        seatIndex: null,
        micMuted: true,
        mutedByModerator: out.mutedByModerator,
      });
    }
    return { onStage: false };
  }

  // ─── Speak requests ─────────────────────────────────────────────────────

  async requestToSpeak(user: JwtPayload, id: string) {
    await this.sweepStaleSpeakers(id);
    const out = await this.withCouncilLock(id, async (tx) => {
      const member = await this.findMember(tx, id, user.userId);
      this.assertActiveMember(member);
      if (member.seatIndex !== null) {
        throwApi(409, 'already_on_stage', 'أنت ضمن المتحدثين بالفعل');
      }
      const pending = await tx.councilSpeakRequest.findFirst({
        where: { councilId: id, userId: user.userId, status: 'PENDING' },
      });
      if (pending) return { request: pending, created: false };
      const lastRejected = await tx.councilSpeakRequest.findFirst({
        where: { councilId: id, userId: user.userId, status: 'REJECTED' },
        orderBy: { decidedAt: 'desc' },
        select: { decidedAt: true },
      });
      if (
        lastRejected?.decidedAt &&
        Date.now() - lastRejected.decidedAt.getTime() <
          COUNCIL_REQUEST_COOLDOWN_MS
      ) {
        throwApi(
          429,
          'request_cooldown',
          'يرجى الانتظار قليلاً قبل إعادة الطلب',
        );
      }
      const seated = await tx.councilMember.count({
        where: { councilId: id, seatIndex: { not: null } },
      });
      if (seated >= COUNCIL_MAX_SPEAKERS) {
        throwApi(409, 'council_full', FULL_AR);
      }
      const request = await tx.councilSpeakRequest.create({
        data: { councilId: id, userId: user.userId },
      });
      return { request, created: true };
    });
    if (out.created) await this.realtime.emitRequests(id);
    return { requestId: out.request.id, status: out.request.status };
  }

  async cancelRequest(user: JwtPayload, id: string) {
    const { count } = await this.prisma.councilSpeakRequest.updateMany({
      where: { councilId: id, userId: user.userId, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
    if (count > 0) await this.realtime.emitRequests(id);
    return { cancelled: count > 0 };
  }

  async decideRequest(
    user: JwtPayload,
    id: string,
    requestId: string,
    accept: boolean,
  ) {
    if (accept) await this.sweepStaleSpeakers(id);
    const out = await this.withCouncilLock(id, async (tx, council) => {
      const actor = await this.findMember(tx, id, user.userId);
      const perms = councilPermissions(council, user.userId, actor);
      if (!perms.canManageRequests) throwApi(403, 'forbidden', FORBIDDEN_AR);
      const req = await tx.councilSpeakRequest.findFirst({
        where: { id: requestId, councilId: id },
      });
      if (!req) throwApi(404, 'request_not_found', 'الطلب غير موجود');
      if (req.status !== 'PENDING') {
        throwApi(409, 'request_not_pending', 'تمت معالجة هذا الطلب');
      }
      const decided = { decidedById: user.userId, decidedAt: new Date() };
      if (!accept) {
        await tx.councilSpeakRequest.update({
          where: { id: req.id },
          data: { status: 'REJECTED', ...decided },
        });
        return {
          userId: req.userId,
          status: 'REJECTED' as const,
          seatIndex: null,
        };
      }
      const target = await this.findMember(tx, id, req.userId);
      if (
        !target ||
        target.role === 'BANNED' ||
        (target.kickedUntil && target.kickedUntil > new Date())
      ) {
        await tx.councilSpeakRequest.update({
          where: { id: req.id },
          data: { status: 'CANCELLED', ...decided },
        });
        return {
          userId: req.userId,
          status: 'CANCELLED' as const,
          seatIndex: null,
        };
      }
      const seatIndex = await this.takeSeat(tx, id, target);
      await tx.councilSpeakRequest.update({
        where: { id: req.id },
        data: { status: 'ACCEPTED', ...decided },
      });
      return {
        userId: req.userId,
        status: 'ACCEPTED' as const,
        seatIndex,
        role: roleOnStage(target.role),
      };
    });
    this.realtime.emitToUser(out.userId, id, 'council:request-result', {
      requestId,
      status: out.status,
    });
    if (out.status === 'ACCEPTED') {
      this.realtime.emitToUser(out.userId, id, 'council:role', {
        role: 'role' in out ? out.role : 'SPEAKER',
        seatIndex: out.seatIndex,
        micMuted: true,
        mutedByModerator: false,
      });
      await this.realtime.emitSpeakers(id);
      void this.agoraModeration.lift(id, out.userId);
    }
    await this.realtime.emitRequests(id);
    return { requestId, status: out.status, seatIndex: out.seatIndex };
  }

  // ─── Moderation ─────────────────────────────────────────────────────────

  async memberAction(
    user: JwtPayload,
    id: string,
    targetUserId: string,
    action: CouncilMemberAction,
  ) {
    if (action === 'promote') await this.sweepStaleSpeakers(id);
    const out = await this.withCouncilLock(id, async (tx, council) => {
      const actor = await this.findMember(tx, id, user.userId);
      const perms = councilPermissions(council, user.userId, actor);
      const target = await this.findMember(tx, id, targetUserId);
      if (!target)
        throwApi(404, 'member_not_found', 'العضو غير موجود في المجلس');
      if (!canActOn(perms, user.userId, target)) {
        throwApi(403, 'forbidden', FORBIDDEN_AR);
      }
      const need = (ok: boolean) => {
        if (!ok) throwApi(403, 'forbidden', FORBIDDEN_AR);
      };
      const now = new Date();
      let cancelledRequests = 0;
      const cancelPending = async () => {
        const { count } = await tx.councilSpeakRequest.updateMany({
          where: { councilId: id, userId: targetUserId, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            decidedAt: now,
            decidedById: user.userId,
          },
        });
        cancelledRequests = count;
      };
      let updated: CouncilMember = target;

      switch (action) {
        case 'promote': {
          need(perms.canManageRequests);
          if (target.role === 'BANNED') {
            throwApi(409, 'member_banned', 'العضو محظور');
          }
          if (target.kickedUntil && target.kickedUntil > now) {
            throwApi(409, 'member_kicked', 'العضو مُزال مؤقتاً');
          }
          await this.takeSeat(tx, id, target);
          break;
        }
        case 'demote': {
          need(perms.canRemove);
          if (target.seatIndex === null) {
            throwApi(409, 'not_on_stage', 'العضو ليس ضمن المتحدثين');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data: {
              seatIndex: null,
              role: roleOffStage(target.role),
              micMuted: true,
              mutedByModerator: false,
            },
          });
          break;
        }
        case 'mute':
        case 'unmute': {
          need(perms.canMute);
          if (target.seatIndex === null) {
            throwApi(409, 'not_on_stage', 'العضو ليس ضمن المتحدثين');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data:
              action === 'mute'
                ? { micMuted: true, mutedByModerator: true }
                : { mutedByModerator: false },
          });
          break;
        }
        case 'kick': {
          need(perms.canRemove);
          if (target.role === 'BANNED') {
            throwApi(409, 'member_banned', 'العضو محظور');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data: {
              role: 'LISTENER',
              seatIndex: null,
              micMuted: true,
              mutedByModerator: false,
              kickedUntil: new Date(
                now.getTime() + COUNCIL_KICK_MINUTES * 60_000,
              ),
            },
          });
          await cancelPending();
          break;
        }
        case 'ban': {
          need(perms.canBan);
          await tx.councilMember.update({
            where: { id: target.id },
            data: {
              role: 'BANNED',
              seatIndex: null,
              micMuted: true,
              mutedByModerator: false,
              bannedAt: now,
              bannedById: user.userId,
              kickedUntil: null,
            },
          });
          await cancelPending();
          break;
        }
        case 'unban': {
          need(perms.canBan);
          if (target.role !== 'BANNED') {
            throwApi(409, 'not_banned', 'العضو غير محظور');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data: { role: 'LISTENER', bannedAt: null, bannedById: null },
          });
          break;
        }
        case 'make_moderator': {
          need(perms.canManageModerators);
          if (target.role === 'BANNED') {
            throwApi(409, 'member_banned', 'العضو محظور');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data: { role: 'MODERATOR' },
          });
          break;
        }
        case 'remove_moderator': {
          need(perms.canManageModerators);
          if (target.role !== 'MODERATOR') {
            throwApi(409, 'not_moderator', 'العضو ليس مشرفاً');
          }
          await tx.councilMember.update({
            where: { id: target.id },
            data: { role: target.seatIndex !== null ? 'SPEAKER' : 'LISTENER' },
          });
          break;
        }
      }
      updated = (await this.findMember(tx, id, targetUserId))!;
      return { before: target, after: updated, cancelledRequests };
    });

    await this.afterMemberAction(id, targetUserId, action, out);
    return {
      action,
      member: {
        userId: targetUserId,
        role: out.after.role,
        seatIndex: out.after.seatIndex,
        micMuted: out.after.micMuted,
        mutedByModerator: out.after.mutedByModerator,
      },
    };
  }

  private async afterMemberAction(
    id: string,
    targetUserId: string,
    action: CouncilMemberAction,
    out: {
      before: CouncilMember;
      after: CouncilMember;
      cancelledRequests: number;
    },
  ) {
    const { before, after } = out;
    if (action === 'kick' || action === 'ban') {
      this.realtime.emitToUser(targetUserId, id, 'council:kicked', {
        reason: action === 'ban' ? 'banned' : 'removed',
      });
      await this.presence.remove(id, targetUserId);
      void this.agoraModeration.blockJoin(
        id,
        targetUserId,
        action === 'ban' ? BAN_AGORA_SECONDS : COUNCIL_KICK_MINUTES * 60,
      );
    } else if (action !== 'unban') {
      this.realtime.emitToUser(targetUserId, id, 'council:role', {
        role: after.role,
        seatIndex: after.seatIndex,
        micMuted: after.micMuted,
        mutedByModerator: after.mutedByModerator,
      });
    }

    if (action === 'demote' || action === 'mute') {
      void this.agoraModeration.blockPublish(
        id,
        targetUserId,
        COUNCIL_SPEAKER_PUBLISH_EXPIRE,
      );
    } else if (
      action === 'promote' ||
      action === 'unmute' ||
      action === 'unban'
    ) {
      void this.agoraModeration.lift(id, targetUserId);
    }

    const stageTouched =
      before.seatIndex !== after.seatIndex ||
      before.role !== after.role ||
      before.micMuted !== after.micMuted ||
      before.mutedByModerator !== after.mutedByModerator;
    if (
      stageTouched &&
      (before.seatIndex !== null || after.seatIndex !== null)
    ) {
      await this.realtime.emitSpeakers(id);
    } else if (action === 'kick' || action === 'ban') {
      await this.realtime.emitListenerCount(id);
    }
    if (
      out.cancelledRequests > 0 ||
      action === 'promote' ||
      action === 'make_moderator' ||
      action === 'remove_moderator'
    ) {
      await this.realtime.emitRequests(id);
    }
  }

  // ─── Disconnected speakers ──────────────────────────────────────────────

  /**
   * Frees the seats of speakers whose socket presence went stale (connection lost
   * and not back within COUNCIL_STALE_SPEAKER_MS). The owner keeps seat 0 so they can
   * return. Skipped when presence is not shared (no Redis) to avoid false positives.
   */
  async sweepStaleSpeakers(id: string): Promise<number> {
    if (!this.presence.isShared()) return 0;
    const cutoff = new Date(Date.now() - COUNCIL_STALE_SPEAKER_MS);
    const seated = await this.prisma.councilMember.findMany({
      where: {
        councilId: id,
        seatIndex: { not: null },
        role: { not: 'OWNER' },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, userId: true, role: true },
    });
    if (seated.length === 0) return 0;
    const present = await this.presence.presentAmong(
      id,
      seated.map((s) => s.userId),
    );
    let freed = 0;
    for (const s of seated) {
      if (present.has(s.userId)) continue;
      const { count } = await this.prisma.councilMember.updateMany({
        where: {
          id: s.id,
          seatIndex: { not: null },
          updatedAt: { lt: cutoff },
        },
        data: { seatIndex: null, role: roleOffStage(s.role), micMuted: true },
      });
      if (count > 0) {
        freed++;
        this.realtime.emitToUser(s.userId, id, 'council:role', {
          role: roleOffStage(s.role),
          seatIndex: null,
          micMuted: true,
          mutedByModerator: false,
        });
      }
    }
    if (freed > 0) await this.realtime.emitSpeakers(id);
    return freed;
  }
}
