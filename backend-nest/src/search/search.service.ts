import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { notDeleted } from '../common/utils/soft-delete.util';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import {
  applyAntiDomination,
  extractHashtags,
  extractTopicTokens,
  scoreTrendingSignal,
  trendingWindowMs,
  type ScoredTrendingItem,
  type TrendingSignalInput,
  type TrendingWindow,
} from './lib/trending-score.util';

const TRENDING_CACHE_TTL_SEC = 90;
const TRENDING_POST_LIMIT = 300;

type Acc = {
  key: string;
  label: string;
  kind: 'hashtag' | 'topic' | 'phrase';
  volume: number;
  authors: Set<string>;
  engagement: number;
  recentHalfVolume: number;
  newestAt: number;
};

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

  findExploreListings(take: number) {
    return this.prisma.listing.findMany({
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
        promoted: true,
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
    const cacheKey = `search:trending:v3:${window}:${limit}`;

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

    const acc = new Map<string, Acc>();

    const bump = (
      key: string,
      label: string,
      kind: Acc['kind'],
      authorId: string,
      engagement: number,
      createdAt: Date,
    ) => {
      const normalized = key.toLowerCase();
      let row = acc.get(normalized);
      if (!row) {
        row = {
          key: normalized,
          label,
          kind,
          volume: 0,
          authors: new Set(),
          engagement: 0,
          recentHalfVolume: 0,
          newestAt: 0,
        };
        acc.set(normalized, row);
      }
      row.volume += 1;
      row.authors.add(authorId);
      row.engagement += engagement;
      if (createdAt.getTime() >= midpoint) row.recentHalfVolume += 1;
      row.newestAt = Math.max(row.newestAt, createdAt.getTime());
    };

    for (const post of posts) {
      const text = `${post.content ?? ''} ${post.arabicContent ?? ''}`;
      const engagement =
        (post.likesCount ?? 0) +
        (post.commentsCount ?? 0) +
        (post.repostsCount ?? 0);
      for (const tag of extractHashtags(text)) {
        bump(tag, tag, 'hashtag', post.authorId, engagement, post.createdAt);
      }
      for (const token of extractTopicTokens(text)) {
        // Prefer hashtags when both exist; topics fill gaps
        if (acc.has(`#${token}`)) continue;
        bump(token, token, 'topic', post.authorId, engagement, post.createdAt);
      }
    }

    const scored: ScoredTrendingItem[] = [];
    for (const row of acc.values()) {
      // Require minimal signal to avoid noise
      if (row.volume < 2 && row.kind !== 'hashtag') continue;
      if (row.volume < 1) continue;
      const input: TrendingSignalInput = {
        key: row.key,
        label: row.label,
        kind: row.kind,
        volume: row.volume,
        uniqueAuthors: row.authors.size,
        engagement: row.engagement,
        recentHalfVolume: row.recentHalfVolume,
        ageMs: Date.now() - row.newestAt,
      };
      scored.push({
        tag: row.label,
        kind: row.kind,
        count: row.volume,
        score: scoreTrendingSignal(input, windowMs),
        uniqueAuthors: row.authors.size,
        engagement: row.engagement,
      });
    }

    const trending = applyAntiDomination(scored, limit);
    const payload = { trending, window };

    if (this.cache.isEnabled()) {
      await this.cache
        .set(cacheKey, payload, TRENDING_CACHE_TTL_SEC)
        .catch(() => {});
    }

    return payload;
  }
}
