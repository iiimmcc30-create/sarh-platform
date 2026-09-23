import { Injectable } from '@nestjs/common';
import { ApiException, throwApi } from '../common/exceptions/api.exception';
import { LoggerService } from '../common/services/logger.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { MessagesService } from '../messages/messages.service';
import {
  clampStoryDuration,
  STORY_IMAGE_DURATION_SEC,
  storyExpiresAt,
} from '@/lib/stories';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CreateButcherStoryDto,
  CreateStoryDto,
  StoryReactionDto,
  StoryReplyDto,
} from './dto/stories.dto';
import { StoriesRepository } from './repositories/stories.repository';
import { StoryViewRepository } from './repositories/story-view.repository';
import { StoryReactionRepository } from './repositories/story-reaction.repository';

type StoryRow = Awaited<
  ReturnType<StoriesRepository['findActiveStories']>
>[number];

type MappedStory = ReturnType<StoriesService['mapStory']>;

type StoryGroupPayload = {
  user: StoryRow['user'];
  hasUnseen: boolean;
  latestThumbnail: string;
  storiesCount: number;
  stories: MappedStory[];
};

type StoriesFeedPayload = {
  items: StoryGroupPayload[];
  myStories: StoryGroupPayload | null;
};

@Injectable()
export class StoriesService {
  constructor(
    private readonly repo: StoriesRepository,
    private readonly views: StoryViewRepository,
    private readonly reactions: StoryReactionRepository,
    private readonly cache: RedisCacheService,
    private readonly notifications: AppNotificationsService,
    private readonly messages: MessagesService,
    private readonly logger: LoggerService,
  ) {}

  private mapStory(
    story: StoryRow,
    opts: { seen: boolean; myReaction: string | null },
  ) {
    return {
      id: story.id,
      thumbnail: story.thumbnail,
      mediaUrl: story.mediaUrl,
      caption: story.caption,
      captionAr: story.captionAr,
      location: story.location,
      duration: story.duration,
      isLive: story.isLive,
      liveStreamId: story.liveStreamId,
      listingId: story.listingId,
      listing: story.listing
        ? {
            id: story.listing.id,
            title: story.listing.title,
            arabicTitle: story.listing.arabicTitle,
            images: story.listing.images,
            price: story.listing.price,
            currency: story.listing.currency,
          }
        : null,
      viewsCount: story.viewsCount,
      reactionsCount: story.reactionsCount,
      myReaction: opts.myReaction,
      seen: opts.seen,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      user: story.user,
    };
  }

  private async buildFeed(viewerId?: string) {
    const active = await this.repo.findActiveStories();
    const storyIds = active.map((s) => s.id);

    const [viewedRows, reactionRows] = await Promise.all([
      viewerId
        ? this.views.findViewedStoryIds(viewerId, storyIds)
        : Promise.resolve([] as { storyId: string }[]),
      viewerId
        ? this.reactions.findReactionsForStories(viewerId, storyIds)
        : Promise.resolve([] as { storyId: string; type: string }[]),
    ]);

    const viewed = new Set(viewedRows.map((v) => v.storyId));
    const myReactions = new Map(
      reactionRows.map((r) => [r.storyId, r.type] as const),
    );

    const byUser = new Map<
      string,
      {
        user: StoryRow['user'];
        stories: ReturnType<StoriesService['mapStory']>[];
        hasUnseen: boolean;
        latestAt: number;
      }
    >();

    for (const story of active) {
      const mapped = this.mapStory(story, {
        seen: viewed.has(story.id),
        myReaction: myReactions.get(story.id) ?? null,
      });
      const existing = byUser.get(story.userId);
      if (!existing) {
        byUser.set(story.userId, {
          user: story.user,
          stories: [mapped],
          hasUnseen: !mapped.seen,
          latestAt: story.createdAt.getTime(),
        });
      } else {
        existing.stories.push(mapped);
        existing.hasUnseen = existing.hasUnseen || !mapped.seen;
        existing.latestAt = Math.max(
          existing.latestAt,
          story.createdAt.getTime(),
        );
      }
    }

    const groups = [...byUser.values()].map((g) => ({
      user: g.user,
      hasUnseen: g.hasUnseen,
      latestThumbnail:
        g.stories[g.stories.length - 1]?.thumbnail ?? g.user.avatar ?? '',
      storiesCount: g.stories.length,
      stories: g.stories,
      latestAt: g.latestAt,
    }));

    groups.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt - a.latestAt;
    });

    return groups.map(({ latestAt: _latestAt, ...rest }) => rest);
  }

  async getFeed(user?: JwtPayload): Promise<StoriesFeedPayload> {
    const viewerId = user?.userId;
    const cacheKey = viewerId
      ? `stories:feed:${viewerId}`
      : 'stories:feed:anon';

    const cached = await this.cache.get<StoriesFeedPayload>(cacheKey);
    if (cached) return cached;

    try {
      const items = await this.buildFeed(viewerId);
      const myStories = viewerId
        ? (items.find((i) => i.user.id === viewerId) ?? null)
        : null;
      const others = viewerId
        ? items.filter((i) => i.user.id !== viewerId)
        : items;

      const payload: StoriesFeedPayload = { items: others, myStories };
      await this.cache.set(cacheKey, payload, 20);
      return payload;
    } catch (err) {
      this.logger.error({ err }, 'Fetch stories feed error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  /** Legacy flat list for older clients */
  async getActiveStories(user?: JwtPayload) {
    const feed = await this.getFeed(user);
    const groups = [...(feed.myStories ? [feed.myStories] : []), ...feed.items];
    return groups.flatMap((g) =>
      g.stories.map((s) => ({
        ...s,
        user: g.user,
      })),
    );
  }

  async getUserStories(userId: string, viewer?: JwtPayload) {
    if (!userId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const stories = await this.repo.findActiveStoriesForUser(userId);
    if (stories.length === 0) {
      return { user: null, stories: [], hasUnseen: false };
    }

    const storyIds = stories.map((s) => s.id);
    const viewerId = viewer?.userId;
    const [viewedRows, reactionRows] = await Promise.all([
      viewerId
        ? this.views.findViewedStoryIds(viewerId, storyIds)
        : Promise.resolve([] as { storyId: string }[]),
      viewerId
        ? this.reactions.findReactionsForStories(viewerId, storyIds)
        : Promise.resolve([] as { storyId: string; type: string }[]),
    ]);
    const viewed = new Set(viewedRows.map((v) => v.storyId));
    const myReactions = new Map(
      reactionRows.map((r) => [r.storyId, r.type] as const),
    );

    const mapped = stories.map((s) =>
      this.mapStory(s, {
        seen: viewed.has(s.id),
        myReaction: myReactions.get(s.id) ?? null,
      }),
    );

    return {
      user: stories[0].user,
      hasUnseen: mapped.some((s) => !s.seen),
      latestThumbnail: mapped[mapped.length - 1]?.thumbnail ?? '',
      storiesCount: mapped.length,
      stories: mapped,
    };
  }

  async createStory(user: JwtPayload, dto: CreateStoryDto) {
    if (dto.listingId) {
      const listing = await this.repo.findListingOwnedByUser(
        dto.listingId,
        user.userId,
      );
      if (!listing) {
        throwApi(400, 'invalid_listing', 'الإعلان غير موجود أو غير مملوك لك');
      }
    }

    const expiresAt = storyExpiresAt();
    const duration = clampStoryDuration(
      dto.duration ?? STORY_IMAGE_DURATION_SEC,
    );

    try {
      const story = await this.repo.createStory({
        thumbnail: dto.thumbnail,
        mediaUrl: dto.mediaUrl ?? undefined,
        caption: dto.caption ?? undefined,
        captionAr: dto.captionAr ?? undefined,
        location: dto.location ?? undefined,
        isLive: dto.isLive ?? false,
        liveStreamId: dto.liveStreamId ?? undefined,
        listing: dto.listingId ? { connect: { id: dto.listingId } } : undefined,
        duration,
        expiresAt,
        user: { connect: { id: user.userId } },
      });

      await this.invalidateFeedCache();
      this.logger.info(
        { storyId: story.id, userId: user.userId },
        'Story created successfully',
      );
      return this.mapStory(story, { seen: false, myReaction: null });
    } catch (err) {
      this.logger.error({ err }, 'Create story error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async deleteStory(user: JwtPayload, id: string) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(id);
    if (!story) throwApi(404, 'not_found', 'القصة غير موجودة');
    if (story.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.softDeleteStory(id);
    await this.invalidateFeedCache();

    this.logger.info(
      { storyId: id, userId: user.userId },
      'User story deleted',
    );
    return { deleted: true };
  }

  async recordView(user: JwtPayload, storyId: string) {
    if (!storyId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(storyId);
    if (!story || story.expiresAt <= new Date()) {
      throwApi(404, 'not_found', 'القصة غير موجودة أو منتهية');
    }

    if (story.userId === user.userId) {
      return { recorded: false, viewsCount: undefined };
    }

    const existing = await this.views.findView(storyId, user.userId);
    if (existing) {
      return { recorded: false };
    }

    await this.views.createView(storyId, user.userId);
    const updated = await this.repo.incrementViewsCount(storyId);
    await this.invalidateFeedCache(user.userId);

    return { recorded: true, viewsCount: updated.viewsCount };
  }

  async getViewers(user: JwtPayload, storyId: string) {
    if (!storyId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(storyId);
    if (!story) throwApi(404, 'not_found', 'القصة غير موجودة');
    if (story.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const rows = await this.views.findViewers(storyId);
    return {
      viewsCount: rows.length,
      viewers: rows.map((r) => ({
        id: r.viewer.id,
        username: r.viewer.username,
        displayName: r.viewer.displayName,
        arabicName: r.viewer.arabicName,
        avatar: r.viewer.avatar,
        verified: r.viewer.verified,
        viewedAt: r.createdAt,
      })),
    };
  }

  async setReaction(user: JwtPayload, storyId: string, dto: StoryReactionDto) {
    if (!storyId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(storyId);
    if (!story || story.expiresAt <= new Date()) {
      throwApi(404, 'not_found', 'القصة غير موجودة أو منتهية');
    }

    const previous = await this.reactions.findReaction(storyId, user.userId);
    await this.reactions.upsertReaction(storyId, user.userId, dto.type);
    const count = await this.repo.countReactions(storyId);
    await this.repo.setReactionsCount(storyId, count);
    await this.invalidateFeedCache();

    if (story.userId !== user.userId && previous?.type !== dto.type) {
      void this.notifications.notifyUser({
        userId: story.userId,
        type: 'story_reaction',
        titleAr: 'تفاعل على قصتك',
        bodyAr: `تفاعل شخص ما على قصتك بـ ${dto.type}`,
        data: {
          storyId,
          actorId: user.userId,
          reaction: dto.type,
        },
      });
    }

    return { type: dto.type, reactionsCount: count };
  }

  async removeReaction(user: JwtPayload, storyId: string) {
    if (!storyId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(storyId);
    if (!story) throwApi(404, 'not_found', 'القصة غير موجودة');

    await this.reactions.deleteReaction(storyId, user.userId);
    const count = await this.repo.countReactions(storyId);
    await this.repo.setReactionsCount(storyId, count);
    await this.invalidateFeedCache();

    return { removed: true, reactionsCount: count };
  }

  async replyToStory(user: JwtPayload, storyId: string, dto: StoryReplyDto) {
    if (!storyId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryOwnerMeta(storyId);
    if (!story || story.expiresAt <= new Date()) {
      throwApi(404, 'not_found', 'القصة غير موجودة أو منتهية');
    }
    if (story.userId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك الرد على قصتك');
    }

    const caption = story.captionAr || story.caption;
    const prefix = caption ? `رد على قصتك: ${caption}\n` : 'رد على قصتك:\n';
    const result = await this.messages.sendMessage(user, {
      receiverId: story.userId,
      text: `${prefix}${dto.text}`,
    });

    void this.notifications.notifyUser({
      userId: story.userId,
      type: 'story_reply',
      titleAr: 'رد على قصتك',
      bodyAr: dto.text.slice(0, 80),
      data: {
        storyId,
        actorId: user.userId,
        threadId: result.threadId,
        messageId: result.message.id,
      },
    });

    return {
      threadId: result.threadId,
      messageId: result.message.id,
      receiverId: story.userId,
    };
  }

  private async invalidateFeedCache(viewerId?: string) {
    await this.cache.del('stories:feed:anon', 'stories:active');
    if (viewerId) await this.cache.del(`stories:feed:${viewerId}`);
    await this.cache.delPattern('stories:feed:*');
  }

  async getActiveButcherStories() {
    const cacheKey = 'butchers:stories:active';
    const cached = await this.cache.get<unknown[]>(cacheKey);
    if (cached) return cached;

    try {
      const activeStories = await this.repo.findActiveButcherStories();
      await this.cache.set(cacheKey, activeStories, 30);
      return activeStories;
    } catch (err) {
      this.logger.error({ err }, 'Fetch active butcher stories error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async createButcherStory(user: JwtPayload, dto: CreateButcherStoryDto) {
    try {
      const butcher = await this.repo.findButcherByUserId(user.userId);
      if (!butcher) {
        throwApi(
          403,
          'butcher_profile_required',
          'يجب أن تمتلك ملف ملحمة نشط لنشر القصص',
        );
      }

      const expiresAt = storyExpiresAt();
      const duration = clampStoryDuration(
        dto.duration ?? STORY_IMAGE_DURATION_SEC,
      );

      const story = await this.repo.createButcherStory({
        thumbnail: dto.thumbnail,
        mediaUrl: dto.mediaUrl ?? undefined,
        caption: dto.caption ?? undefined,
        captionAr: dto.captionAr ?? undefined,
        type: dto.type,
        duration,
        expiresAt,
        butcher: { connect: { id: butcher.id } },
      });

      await this.cache.del('butchers:stories:active');
      this.logger.info(
        { storyId: story.id, butcherId: butcher.id },
        'Butcher story created successfully',
      );
      return story;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Create butcher story error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async deleteButcherStory(user: JwtPayload, id: string) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findButcherStoryWithOwner(id);
    if (!story) throwApi(404, 'not_found', 'القصة غير موجودة');
    if (story.butcher.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.softDeleteButcherStory(id);
    await this.cache.del('butchers:stories:active');

    this.logger.info(
      { storyId: id, userId: user.userId },
      'Butcher story deleted',
    );
    return { deleted: true };
  }
}
