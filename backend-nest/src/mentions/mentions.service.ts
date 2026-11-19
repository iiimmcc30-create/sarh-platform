import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { LoggerService } from '../common/services/logger.service';
import { actorNotificationData } from '../notifications/actor-payload';
import { wantsMentionNotice } from '../notifications/notification-prefs';
import { parseMentionTexts } from './mentions.lib';

export type MentionContext = {
  postId?: string;
  commentId?: string;
  listingId?: string;
  storyId?: string;
  threadId?: string;
  messageId?: string;
};

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  notificationPrefs: true,
} as const;

@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: AppNotificationsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Resolve @handles in the saved text, store them, and notify only people
   * who were not already mentioned on this entity. Self, unknown handles and
   * blocked accounts are not notified.
   */
  async sync(input: {
    actorId: string;
    entityType: string;
    entityId: string;
    texts: Array<string | null | undefined>;
    context?: MentionContext;
  }): Promise<{ mentioned: string[]; notified: string[] }> {
    try {
      const handles = parseMentionTexts(input.texts);
      const users = handles.length
        ? await this.prisma.user.findMany({
            where: {
              username: { in: handles },
              isActive: true,
              deletedAt: null,
              id: { not: input.actorId },
            },
            select: USER_SELECT,
          })
        : [];
      const byName = new Map(users.map((user) => [user.username, user]));
      const desired = handles
        .map((handle) => byName.get(handle))
        .filter((user): user is (typeof users)[number] => Boolean(user));
      const desiredIds = desired.map((user) => user.id);

      const existing = await this.prisma.mention.findMany({
        where: { entityType: input.entityType, entityId: input.entityId },
        select: { mentionedId: true },
      });
      const previous = new Set(existing.map((row) => row.mentionedId));

      await this.prisma.mention.deleteMany({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
          ...(desiredIds.length ? { mentionedId: { notIn: desiredIds } } : {}),
        },
      });

      const fresh = desired.filter((user) => !previous.has(user.id));
      if (fresh.length) {
        await this.prisma.mention.createMany({
          data: fresh.map((user) => ({
            actorId: input.actorId,
            mentionedId: user.id,
            entityType: input.entityType,
            entityId: input.entityId,
            username: user.username,
          })),
          skipDuplicates: true,
        });
      }

      const blocked = await this.blockedIds(
        input.actorId,
        fresh.map((user) => user.id),
      );
      const actor = await this.prisma.user.findUnique({
        where: { id: input.actorId },
        select: {
          arabicName: true,
          displayName: true,
          username: true,
          avatar: true,
        },
      });
      const actorData = actorNotificationData(
        input.actorId,
        actor,
        actor?.username,
      );
      const notified: string[] = [];
      for (const user of fresh) {
        if (
          blocked.has(user.id) ||
          !wantsMentionNotice(user.notificationPrefs)
        ) {
          continue;
        }
        notified.push(user.id);
        await this.notifications.notifyUser({
          userId: user.id,
          type: 'mention',
          titleAr: 'إشارة إليك',
          bodyAr: `${actorData.actorName} أشار إليك`,
          data: {
            mention: '1',
            kind: 'mention',
            entityType: input.entityType,
            entityId: input.entityId,
            ...actorData,
            ...(input.context ?? {}),
          },
        });
      }
      return { mentioned: desiredIds, notified };
    } catch (err) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          entityType: input.entityType,
          entityId: input.entityId,
        },
        'mention sync failed',
      );
      return { mentioned: [], notified: [] };
    }
  }

  async suggest(viewerId: string, rawQuery: string) {
    const query = rawQuery.trim().replace(/^@/, '').toLowerCase().slice(0, 30);
    const blocked = await this.blockedWithViewer(viewerId);
    const base = {
      isActive: true,
      deletedAt: null,
      id: { notIn: [viewerId, ...blocked] },
    };
    if (!query) {
      const follows = await this.prisma.follow.findMany({
        where: { followerId: viewerId, following: base },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          following: { select: USER_SELECT },
        },
      });
      return follows.map((row) => this.present(row.following, true));
    }
    const rows = await this.prisma.user.findMany({
      where: {
        ...base,
        OR: [
          { username: { startsWith: query } },
          { arabicName: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: USER_SELECT,
      take: 24,
    });
    const followed = await this.prisma.follow.findMany({
      where: {
        followerId: viewerId,
        followingId: { in: rows.map((row) => row.id) },
      },
      select: { followingId: true },
    });
    const followedIds = new Set(followed.map((row) => row.followingId));
    return rows
      .sort((a, b) => {
        const af = followedIds.has(a.id) ? 0 : 1;
        const bf = followedIds.has(b.id) ? 0 : 1;
        if (af !== bf) return af - bf;
        const aPrefix = a.username.startsWith(query) ? 0 : 1;
        const bPrefix = b.username.startsWith(query) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.username.localeCompare(b.username);
      })
      .slice(0, 8)
      .map((user) => this.present(user, followedIds.has(user.id)));
  }

  private present(
    user: {
      id: string;
      username: string;
      displayName: string;
      arabicName: string;
      avatar: string | null;
    },
    following: boolean,
  ) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      arabicName: user.arabicName,
      avatar: user.avatar,
      following,
    };
  }

  private async blockedWithViewer(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
      take: 2000,
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }
    return [...ids];
  }

  private async blockedIds(
    actorId: string,
    otherIds: string[],
  ): Promise<Set<string>> {
    if (otherIds.length === 0) return new Set();
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: actorId, blockedId: { in: otherIds } },
          { blockedId: actorId, blockerId: { in: otherIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.blockerId === actorId ? row.blockedId : row.blockerId);
    }
    return ids;
  }
}
