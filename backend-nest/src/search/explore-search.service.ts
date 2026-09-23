import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { SearchService } from './search.service';
import { SearchRepository } from './search.service';

const EXPLORE_CACHE_TTL_SEC = 60;

export type ExploreSectionType =
  | 'trending_topics'
  | 'accounts'
  | 'listings'
  | 'news'
  | 'feed_categories'
  | 'feed_suppliers';

export type ExploreSection = {
  type: ExploreSectionType;
  title: string;
  items: unknown[];
};

@Injectable()
export class ExploreSearchService {
  constructor(
    private readonly search: SearchService,
    private readonly repo: SearchRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async getExploreFeed() {
    const cacheKey = 'search:explore:v1:public';

    if (this.cache.isEnabled()) {
      const cached = await this.cache.get<{ sections: ExploreSection[] }>(
        cacheKey,
      );
      if (cached?.sections) return cached;
    }

    const [trending, accounts, listings, news, categories, suppliers] =
      await Promise.all([
        this.search.getTrending({ window: '24h', limit: 8 }),
        this.repo.findActiveAccounts(12),
        this.repo.findExploreListings(8),
        this.repo.findExploreNews(3),
        this.repo.findExploreCategories(8),
        this.repo.findExploreFeedSuppliers(4),
      ]);

    // Rank accounts: verified + follower/post activity, then recency
    const rankedAccounts = [...accounts]
      .map((u) => {
        const followers = u._count?.followers ?? 0;
        const posts = u._count?.posts ?? 0;
        const score =
          (u.verified ? 20 : 0) +
          Math.log2(1 + followers) * 6 +
          Math.log2(1 + posts) * 4;
        return { user: u, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ user }) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        arabicName: user.arabicName,
        avatar: user.avatar,
        verified: user.verified,
        followers: user._count?.followers ?? 0,
      }));

    // Soft anti-domination on listings: max 2 from same category
    const listingItems: typeof listings = [];
    const categoryCounts = new Map<string, number>();
    for (const row of listings) {
      const cat = row.category ?? 'other';
      const n = categoryCounts.get(cat) ?? 0;
      if (n >= 2) continue;
      categoryCounts.set(cat, n + 1);
      listingItems.push(row);
      if (listingItems.length >= 6) break;
    }

    const sections: ExploreSection[] = [];

    if (trending.trending.length > 0) {
      sections.push({
        type: 'trending_topics',
        title: 'الأكثر تداولاً',
        items: trending.trending.slice(0, 8),
      });
    }

    if (rankedAccounts.length > 0) {
      sections.push({
        type: 'accounts',
        title: 'حسابات متداولة',
        items: rankedAccounts,
      });
    }

    if (listingItems.length > 0) {
      sections.push({
        type: 'listings',
        title: 'إعلانات مقترحة',
        items: listingItems,
      });
    }

    if (news.length > 0) {
      sections.push({
        type: 'news',
        title: 'أخبار سرح',
        items: news.map((n) => ({
          id: n.id,
          titleAr: n.titleAr,
          bodyAr: n.bodyAr.slice(0, 120),
          imageUrl: n.imageUrl,
          publishedAt: n.publishedAt ?? n.createdAt,
        })),
      });
    }

    if (categories.length > 0) {
      sections.push({
        type: 'feed_categories',
        title: 'تصنيفات السوق',
        items: categories,
      });
    }

    if (suppliers.length > 0) {
      sections.push({
        type: 'feed_suppliers',
        title: 'موردو الأعلاف',
        items: suppliers,
      });
    }

    // Cap total items ~30
    let total = 0;
    const capped: ExploreSection[] = [];
    for (const section of sections) {
      const room = Math.max(0, 30 - total);
      if (room === 0) break;
      const items = section.items.slice(0, room);
      if (items.length === 0) continue;
      capped.push({ ...section, items });
      total += items.length;
    }

    const payload = { sections: capped };
    if (this.cache.isEnabled()) {
      await this.cache
        .set(cacheKey, payload, EXPLORE_CACHE_TTL_SEC)
        .catch(() => {});
    }
    return payload;
  }
}
