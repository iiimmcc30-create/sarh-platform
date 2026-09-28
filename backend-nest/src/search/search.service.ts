import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { notDeleted } from '../common/utils/soft-delete.util';
import { rankByEffectiveBoost } from '../listings/boost/boost-effective-state';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import {
  applyAntiDomination,
  extractTopicTokens,
  extractUnderscorePhrases,
  scoreTrendingSignal,
  trendingKindBonus,
  trendingWindowMs,
  type ScoredTrendingItem,
  type TrendingSignalInput,
  type TrendingWindow,
} from './lib/trending-score.util';
import { extractHashtagDetails } from './lib/hashtag.util';

const TRENDING_CACHE_TTL_SEC = 90;
const TRENDING_POST_LIMIT = 300;

type Acc = {
  key: string;
  kind: 'hashtag' | 'topic' | 'phrase';
  /** Display variants as written -> count (the most used one is shown). */
  labels: Map<string, number>;
  rawTag: string;
  tokenCount: number;
  volume: number;
  authors: Set<string>;
  engagement: number;
  recentHalfVolume: number;
  newestAt: number;
};

/**
 * v4: whole-hashtag tokenization (#اذكرو_الله stays one topic), per-post
 * de-duplication, no generic single-word fragments. Bumping the version
 * drops v3 payloads that still carry split fragments (e.g. "اذكرو", "الله")
 * without touching any other Redis data; v3 keys expire on their own TTL.
 */
export const TRENDING_CACHE_PREFIX = 'search:trending:v4';

/** Pick the most used display variant (ties -> first seen). */
function topLabel(labels: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [label, count] of labels) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRecentPostsForTrending(since: Date, take: number) {
    return this.prisma.post.findMany({
      where: { createdAt: { gte: since }, ...notDeleted, isHidden: false },
      select: {
        content: true,
        arabicContent: true,
        authorId: true,
        createdAt: true,
        likesCount: true,
        commentsCount: true,
        repostsCount: true,
      },
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findActiveAccounts(take: number) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        showInSearch: true,
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        arabicName: true,
        avatar: true,
        verified: true,
        createdAt: true,
        _count: { select: { followers: true, posts: true } },
      },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  async findExploreListings(take: number) {
    const rows = await this.prisma.listing.findMany({
      where: { status: 'active', ...notDeleted },
      select: {
        id: true,
        title: true,
        arabicTitle: true,
        description: true,
        arabicDescription: true,
        price: true,
        currency: true,
        category: true,
        breed: true,
        age: true,
        location: true,
        arabicLocation: true,
        country: true,
        images: true,
        videoUrl: true,
        thumbnailUrl: true,
        featured: true,
        pinned: true,
        featuredUntil: true,
        pinnedUntil: true,
        promoted: true,
        promotedUntil: true,
        promotionWeight: true,
        views: true,
        createdAt: true,
        seller: {
          select: {
            id: true,
            username: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            verified: true,
            country: true,
          },
        },
        marketCategory: {
          select: { id: true, nameAr: true, slug: true, requiresWeight: true },
        },
        marketSubcategory: {
          select: { id: true, nameAr: true, slug: true, requiresWeight: true },
        },
      },
      orderBy: [
        { pinned: 'desc' },
        { featured: 'desc' },
        { promoted: 'desc' },
        { promotionWeight: 'desc' },
        { createdAt: 'desc' },
      ],
      take,
    });
    // Pinned/Featured by effective state (expired boosts rank as regular).
    return rankByEffectiveBoost(rows);
  }

  findExploreNews(take: number) {
    return this.prisma.editorialStory.findMany({
      where: { isActive: true, ...notDeleted },
      select: {
        id: true,
        titleAr: true,
        bodyAr: true,
        imageUrl: true,
        publishedAt: true,
        createdAt: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take,
    });
  }

  findExploreCategories(take: number) {
    return this.prisma.marketCategory.findMany({
      where: { isActive: true, parentId: null, deletedAt: null },
      select: { id: true, nameAr: true, slug: true, icon: true, emoji: true },
      orderBy: { sortOrder: 'asc' },
      take,
    });
  }

  findExploreFeedSuppliers(take: number) {
    return this.prisma.feedSupplier.findMany({
      where: { published: true, deletedAt: null },
      select: {
        id: true,
        nameAr: true,
        logo: true,
        cityAr: true,
        verified: true,
      },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async getTrending(options?: { window?: TrendingWindow; limit?: number }) {
    const window: TrendingWindow = options?.window ?? '24h';
    const limit = Math.min(Math.max(options?.limit ?? 12, 1), 30);
    const cacheKey = `${TRENDING_CACHE_PREFIX}:${window}:${limit}`;

    if (this.cache.isEnabled()) {
      const cached = await this.cache.get<{
        trending: ScoredTrendingItem[];
        window: string;
      }>(cacheKey);
      if (cached) return cached;
    }

    const windowMs = trendingWindowMs(window);
    const since = new Date(Date.now() - windowMs);
    const midpoint = Date.now() - windowMs / 2;
    const posts = await this.repo.findRecentPostsForTrending(
      since,
      TRENDING_POST_LIMIT,
    );

    const trending = computeTrending(posts, { windowMs, midpoint, limit });
    const payload = { trending, window };

    if (this.cache.isEnabled()) {
      await this.cache
        .set(cacheKey, payload, TRENDING_CACHE_TTL_SEC)
        .catch(() => {});
    }

    return payload;
  }
}

export type TrendingPostInput = {
  content?: string | null;
  arabicContent?: string | null;
  authorId: string;
  createdAt: Date;
  likesCount?: number | null;
  commentsCount?: number | null;
  repostsCount?: number | null;
};

/**
 * Pure trending computation over recent posts (exported for tests).
 *  - Hashtags are whole tokens (#اذكرو_الله) keyed by their normalized form.
 *  - Each post counts once per signal, even when content and arabicContent
 *    repeat the same text.
 *  - Plain words need 2+ distinct authors, skip generic words, and are
 *    dropped when they are just a piece of a trending hashtag.
 *  - Hashtags get a ranking bonus so short generic words never beat them.
 */
export function computeTrending(
  posts: readonly TrendingPostInput[],
  opts: { windowMs: number; midpoint: number; limit: number; now?: number },
): ScoredTrendingItem[] {
  const now = opts.now ?? Date.now();
  const acc = new Map<string, Acc>();

  const bump = (
    key: string,
    label: string,
    kind: Acc['kind'],
    post: TrendingPostInput,
    engagement: number,
    extra: { rawTag?: string; tokenCount?: number } = {},
  ) => {
    let row = acc.get(key);
    if (!row) {
      row = {
        key,
        kind,
        labels: new Map(),
        rawTag: extra.rawTag ?? label,
        tokenCount: extra.tokenCount ?? 1,
        volume: 0,
        authors: new Set(),
        engagement: 0,
        recentHalfVolume: 0,
        newestAt: 0,
      };
      acc.set(key, row);
    }
    row.labels.set(label, (row.labels.get(label) ?? 0) + 1);
    row.volume += 1;
    row.authors.add(post.authorId);
    row.engagement += engagement;
    const at = post.createdAt.getTime();
    if (at >= opts.midpoint) row.recentHalfVolume += 1;
    row.newestAt = Math.max(row.newestAt, at);
  };

  const hashtagParts = new Set<string>();

  for (const post of posts) {
    const texts = [post.content ?? '', post.arabicContent ?? ''];
    const text =
      texts[0].trim() === texts[1].trim() ? texts[0] : texts.join('\n');
    const engagement =
      (post.likesCount ?? 0) +
      (post.commentsCount ?? 0) +
      (post.repostsCount ?? 0);

    for (const tag of extractHashtagDetails(text)) {
      bump(tag.normalizedTag, tag.displayTag, 'hashtag', post, engagement, {
        rawTag: tag.rawTag,
        tokenCount: tag.tokenCount,
      });
      for (const part of tag.normalizedTag.slice(1).split('_')) {
        if (part) hashtagParts.add(part);
      }
    }
    for (const phrase of extractUnderscorePhrases(text)) {
      const key = `~${phrase.toLocaleLowerCase('ar')}`;
      bump(key, phrase, 'phrase', post, engagement, {
        tokenCount: phrase.split('_').length,
      });
      for (const part of phrase.toLocaleLowerCase('ar').split('_')) {
        if (part) hashtagParts.add(part);
      }
    }
    for (const token of extractTopicTokens(text)) {
      bump(token, token, 'topic', post, engagement);
    }
  }

  const scored: ScoredTrendingItem[] = [];
  for (const row of acc.values()) {
    if (row.volume < 1) continue;
    if (row.kind !== 'hashtag') {
      // Require real signal from more than one person for loose words.
      if (row.volume < 2 || row.authors.size < 2) continue;
      // A word that is only a piece of a hashtag is not its own topic.
      if (row.kind === 'topic' && hashtagParts.has(row.key)) continue;
      if (row.kind === 'topic' && acc.has(`#${row.key}`)) continue;
    }
    const input: TrendingSignalInput = {
      key: row.key,
      label: topLabel(row.labels),
      kind: row.kind,
      volume: row.volume,
      uniqueAuthors: row.authors.size,
      engagement: row.engagement,
      recentHalfVolume: row.recentHalfVolume,
      ageMs: now - row.newestAt,
    };
    const display = topLabel(row.labels);
    scored.push({
      tag: display,
      kind: row.kind,
      count: row.volume,
      score:
        Math.round(
          (scoreTrendingSignal(input, opts.windowMs) +
            trendingKindBonus(row.kind, row.tokenCount)) *
            100,
        ) / 100,
      uniqueAuthors: row.authors.size,
      engagement: row.engagement,
      displayTag: display,
      normalizedTag: row.key.startsWith('~') ? row.key.slice(1) : row.key,
      rawTag: row.rawTag,
      tokenCount: row.tokenCount,
      velocity: row.recentHalfVolume,
      lastSeenAt: new Date(row.newestAt).toISOString(),
    });
  }

  return applyAntiDomination(scored, opts.limit);
}
