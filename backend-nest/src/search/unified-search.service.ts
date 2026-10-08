import { Injectable, Optional } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import type { SearchType, UnifiedSearchQueryDto } from './dto/search.dto';
import {
  clampSearchQuery,
  normalizeArabicSearchText,
  tokenizeSearchQuery,
} from './lib/arabic-search.util';
import {
  rankSearchResults,
  scoreAliasMatch,
  scoreMetadataMatch,
  scoreSearchMatch,
  type RankAlternative,
  type RankMetadata,
} from './lib/search-ranking.util';
import { goldSellersFirst } from '../subscriptions/perks/subscriber-perks';
import {
  parseHashtagQuery,
  textHasHashtag,
  type ExtractedHashtag,
} from './lib/hashtag.util';
import { matchPrefix, mergeSuggestions } from './lib/search-suggest.util';
import { UnifiedSearchRepository } from './repositories/unified-search.repository';
import { SearchService } from './search.service';
import {
  ANIMAL_TO_LISTING_CATEGORY,
  type LivestockDictionary,
  type TermMetadata,
} from './terms/livestock-dictionary';
import { LivestockDictionaryService } from './terms/livestock-dictionary.service';
import {
  isFeaturedActive,
  isPromotedActive,
  withEffectiveBoostState,
  type BoostFlagFields,
} from '../listings/boost/boost-effective-state';

/**
 * Listing items keep their row (incl. featuredUntil / pinnedUntil /
 * promotedUntil) in `data`, so a cached payload can be re-evaluated at read
 * time: an expired boost never comes back as active from Redis.
 */
export function withEffectiveListingGroups(
  groups: SearchGroup[],
  now: Date = new Date(),
): SearchGroup[] {
  return groups.map((group) =>
    group.type !== 'listings'
      ? group
      : {
          ...group,
          items: group.items.map((item) => ({
            ...item,
            data: withEffectiveBoostState(
              (item.data ?? {}) as BoostFlagFields & Record<string, unknown>,
              now,
            ),
          })),
        },
  );
}

export type SearchResultItem = {
  type: 'listings' | 'posts' | 'news' | 'services' | 'users';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  relevance: number;
  createdAt?: string;
  data: Record<string, unknown>;
};

export type SearchGroup = {
  type: Exclude<SearchType, 'all'>;
  items: SearchResultItem[];
  page: number;
  limit: number;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 20;
const ALL_TYPE_PER_GROUP = 8;
const SUGGEST_CACHE_TTL_SEC = 90;
/** Aggregate (anonymous) query popularity for suggestions. */
const POPULAR_QUERIES_KEY = 'search:popular:v1';
const POPULAR_QUERIES_TTL_SEC = 14 * 24 * 60 * 60;
const POPULAR_SCAN = 200;
/** Hashtag search post-filters rows, so it over-fetches a little. */
const HASHTAG_OVERFETCH = 3;

type GroupArgs = {
  query: string;
  tokens: string[];
  type: SearchType;
  page: number;
  limit: number;
  skip: number;
  filters: {
    categoryId?: string;
    subcategoryId?: string;
    country?: string;
    minPrice?: number;
    maxPrice?: number;
    region?: string;
    listingCategory?: string;
    breed?: string;
  };
  hashtag: ExtractedHashtag | null;
  expansions: RankAlternative[][];
  intent: Partial<RankMetadata>;
};

function toRankMetadata(meta: TermMetadata | null): Partial<RankMetadata> {
  if (!meta) return {};
  const pick = (f: { value: string; confidence: number } | null) =>
    f ? { value: f.value, confidence: f.confidence } : null;
  return {
    animalType: pick(meta.animalType),
    breed: pick(meta.breed),
    gender: pick(meta.gender),
    ageStage: pick(meta.ageStage),
    reproductiveStatus: pick(meta.reproductiveStatus),
  };
}

const LISTING_CATEGORY_TO_ANIMAL: Record<string, string> = Object.fromEntries(
  Object.entries(ANIMAL_TO_LISTING_CATEGORY)
    .filter(([, v]) => !!v)
    .map(([k, v]) => [v as string, k]),
);

@Injectable()
export class UnifiedSearchService {
  constructor(
    private readonly repo: UnifiedSearchRepository,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly dictionary: LivestockDictionaryService = new LivestockDictionaryService(),
    @Optional() private readonly trending?: SearchService,
  ) {}

  private dict(): LivestockDictionary {
    return (this.dictionary ?? new LivestockDictionaryService()).get();
  }

  async search(dto: UnifiedSearchQueryDto) {
    const started = Date.now();
    const query = clampSearchQuery(dto.q);
    // A whole-hashtag query (#حلال_الطيبين) searches the full tag, not its parts.
    const hashtag = parseHashtagQuery(query);
    const tokens = hashtag ? [] : tokenizeSearchQuery(query);
    const type = dto.type ?? 'all';
    const limit = Math.min(dto.limit ?? DEFAULT_LIMIT, 50);
    const page = dto.page ?? 1;
    const skip = (page - 1) * limit;

    const filters = {
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId,
      country: dto.country,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      region: dto.region,
      listingCategory: dto.animalType
        ? (ANIMAL_TO_LISTING_CATEGORY[dto.animalType] ?? undefined)
        : undefined,
      breed: dto.breed?.trim() || undefined,
    };

    // v2: dictionary expansion + hashtag mode; the dictionary version is part
    // of the key so a terms update invalidates cached results.
    const dictVersion = this.dictionary?.version ?? '';
    const advancedKey = `${dto.animalType ?? ''}:${filters.breed ?? ''}:${dto.gender ?? ''}:${dto.ageStage ?? ''}`;
    const cacheKey = `search:unified:v2:${dictVersion}:${type}:${query}:${page}:${limit}:${filters.categoryId ?? ''}:${filters.subcategoryId ?? ''}:${filters.country ?? ''}:${filters.region ?? ''}:${filters.minPrice ?? ''}:${filters.maxPrice ?? ''}:${advancedKey}`;
    if (this.cache.isEnabled()) {
      const cached = await this.cache.get<{
        query: string;
        type: SearchType;
        groups: SearchGroup[];
        durationMs?: number;
      }>(cacheKey);
      if (cached) {
        this.recordPopularQuery(query, page, cached.groups ?? []);
        return {
          ...cached,
          groups: withEffectiveListingGroups(cached.groups ?? []),
          durationMs: Date.now() - started,
        };
      }
    }

    const typesToSearch: Array<Exclude<SearchType, 'all'>> =
      type === 'all'
        ? ['listings', 'posts', 'users', 'news', 'services']
        : [type as Exclude<SearchType, 'all'>];

    // Dictionary layer (in-memory, no DB): tight alias expansion + intent.
    const dict = this.dict();
    const expansions: RankAlternative[][] = hashtag
      ? []
      : dict.expandQueryTokens(tokens).map((e) => e.alternatives);
    const intent: Partial<RankMetadata> = hashtag
      ? {}
      : toRankMetadata(dict.extractMetadata(query));
    // Explicit advanced params override text-derived intent.
    if (dto.animalType)
      intent.animalType = { value: dto.animalType, confidence: 1 };
    if (dto.breed) intent.breed = { value: dto.breed.trim(), confidence: 1 };
    if (dto.gender) intent.gender = { value: dto.gender, confidence: 1 };
    if (dto.ageStage)
      intent.ageStage = { value: dto.ageStage.trim(), confidence: 1 };

    const groups = await Promise.all(
      typesToSearch.map((groupType) =>
        this.searchGroup(groupType, {
          query,
          tokens,
          type,
          page,
          limit,
          skip,
          filters,
          hashtag,
          expansions,
          intent,
        }),
      ),
    );

    const durationMs = Date.now() - started;
    const resultCount = groups.reduce((n, g) => n + g.items.length, 0);
    this.logger.info(
      {
        durationMs,
        resultCount,
        type,
        tokenCount: tokens.length,
        hashtag: !!hashtag,
        expanded: expansions.some((e) => e.length > 0),
      },
      'Unified search completed',
    );
    this.recordPopularQuery(query, page, groups);

    const payload = {
      query,
      type,
      groups,
      durationMs,
    };
    if (this.cache.isEnabled()) {
      await this.cache.set(cacheKey, payload, 45).catch(() => {});
    }
    return payload;
  }

  async suggest(q: string, limit = 8) {
    const raw = clampSearchQuery(q, 60);
    const prefix = normalizeArabicSearchText(raw);
    if (prefix.length < 2) {
      return { suggestions: [] as Array<{ text: string; kind: string }> };
    }

    const dictVersion = this.dictionary?.version ?? '';
    const cacheKey = `search:suggest:v3:${dictVersion}:${prefix}:${limit}`;
    if (this.cache.isEnabled()) {
      const cached =
        await this.cache.get<Array<{ text: string; kind: string }>>(cacheKey);
      if (cached) return { suggestions: cached };
    }

    const [rows, popular, trendingTags] = await Promise.all([
      this.repo.suggestPrefixes(prefix, limit),
      this.popularQueries(prefix),
      this.trendingTagsFor(raw),
    ]);

    // Real listing titles / services keep their existing weights and order.
    const dbSorted = [...rows].sort((a, b) => b.weight - a.weight);
    const suggestions = mergeSuggestions(
      [
        {
          kind: 'listing',
          weight: 4,
          items: dbSorted
            .filter((r) => r.kind === 'listing')
            .map((r) => r.text),
        },
        { kind: 'query', weight: 3, items: popular, cap: 3 },
        { kind: 'hashtag', weight: 2.5, items: trendingTags, cap: 2 },
        {
          kind: 'term',
          weight: 2,
          items: this.dict().suggest(raw, limit),
          cap: 5,
        },
        {
          kind: 'service',
          weight: 1,
          items: dbSorted
            .filter((r) => r.kind !== 'listing')
            .map((r) => r.text),
        },
      ],
      limit,
    );

    if (this.cache.isEnabled()) {
      await this.cache
        .set(cacheKey, suggestions, SUGGEST_CACHE_TTL_SEC)
        .catch(() => {});
    }

    return { suggestions };
  }

  /** Anonymous, aggregate popularity of successful page-1 queries. */
  private recordPopularQuery(
    query: string,
    page: number,
    groups: SearchGroup[],
  ) {
    if (page !== 1 || !this.cache.isEnabled()) return;
    const text = query.trim();
    if (text.length < 2 || text.length > 40) return;
    if (!groups.some((g) => g.items.length > 0)) return;
    void this.cache
      .zincrby?.(POPULAR_QUERIES_KEY, text, 1, POPULAR_QUERIES_TTL_SEC)
      ?.catch?.(() => {});
  }

  private async popularQueries(prefix: string): Promise<string[]> {
    if (!this.cache.isEnabled() || typeof this.cache.zrevrange !== 'function') {
      return [];
    }
    const top = await this.cache
      .zrevrange(POPULAR_QUERIES_KEY, 0, POPULAR_SCAN - 1)
      .catch(() => [] as string[]);
    return matchPrefix(top ?? [], prefix);
  }

  private async trendingTagsFor(raw: string): Promise<string[]> {
    if (!this.trending) return [];
    try {
      const { trending } = await this.trending.getTrending({
        window: '7d',
        limit: 30,
      });
      return matchPrefix(
        trending.map((t) => t.displayTag ?? t.tag),
        raw,
        true,
      );
    } catch {
      return [];
    }
  }

  private async searchGroup(
    groupType: Exclude<SearchType, 'all'>,
    args: GroupArgs,
  ): Promise<SearchGroup> {
    const groupLimit = args.type === 'all' ? ALL_TYPE_PER_GROUP : args.limit;
    const groupSkip = args.type === 'all' ? 0 : args.skip;
    const fetchTake = groupLimit + 1;
    const { query, filters, hashtag, expansions, intent } = args;
    // Hashtag mode: non-post groups match the tag as one phrase ("حلال الطيبين").
    const tokens = hashtag
      ? [hashtag.normalizedTag.slice(1).replace(/_/g, ' ')]
      : args.tokens;
    const altTerms = expansions.map((alts) => alts.map((a) => a.term));

    let items: SearchResultItem[] = [];
    switch (groupType) {
      case 'listings':
        items = await this.mapListings(
          query,
          tokens,
          altTerms.some((a) => a.length)
            ? await this.repo.searchListings(
                tokens,
                filters,
                groupSkip,
                fetchTake,
                altTerms,
              )
            : await this.repo.searchListings(
                tokens,
                filters,
                groupSkip,
                fetchTake,
              ),
          expansions,
          intent,
        );
        // «بائع ذهبي»: inside the searched region Gold sellers lead (stable).
        if (filters.region?.trim()) {
          items = goldSellersFirst(
            items,
            (item) =>
              (item.data as { seller?: { verified?: boolean | null; verifiedTier?: string | null } | null })
                ?.seller,
          );
        }
        break;
      case 'posts':
        if (hashtag) {
          const rows = await this.repo.searchPostsByHashtag(
            [hashtag.displayTag, hashtag.normalizedTag],
            groupSkip,
            fetchTake * HASHTAG_OVERFETCH,
          );
          items = this.mapPosts(
            query,
            tokens,
            rows
              .filter((row) =>
                textHasHashtag(
                  `${row.content ?? ''}\n${row.arabicContent ?? ''}`,
                  hashtag.normalizedTag,
                ),
              )
              .slice(0, fetchTake),
          );
        } else {
          items = this.mapPosts(
            query,
            tokens,
            altTerms.some((a) => a.length)
              ? await this.repo.searchPosts(
                  tokens,
                  groupSkip,
                  fetchTake,
                  altTerms,
                )
              : await this.repo.searchPosts(tokens, groupSkip, fetchTake),
            expansions,
          );
        }
        break;
      case 'news':
        items = this.mapNews(
          query,
          tokens,
          await this.repo.searchNews(tokens, groupSkip, fetchTake),
        );
        break;
      case 'services':
        items = this.mapServices(
          query,
          tokens,
          await this.repo.searchServices(tokens, groupSkip, fetchTake),
        );
        break;
      case 'users':
        items = this.mapUsers(
          query,
          tokens,
          await this.repo.searchUsers(tokens, groupSkip, fetchTake),
        );
        break;
      default:
        break;
    }

    const hasMore = items.length > groupLimit;
    return {
      type: groupType,
      items: hasMore ? items.slice(0, groupLimit) : items,
      page: args.type === 'all' ? 1 : args.page,
      limit: groupLimit,
      hasMore,
    };
  }

  private async mapListings(
    query: string,
    tokens: string[],
    rows: Awaited<ReturnType<UnifiedSearchRepository['searchListings']>>,
    expansions: RankAlternative[][] = [],
    intent: Partial<RankMetadata> = {},
  ): Promise<SearchResultItem[]> {
    const hasIntent = Object.values(intent).some(Boolean);
    const dict = hasIntent ? this.dict() : null;
    const scored = rows.map((row) => {
      const title = row.arabicTitle || row.title;
      const description = row.arabicDescription || row.description;
      const keywords = [row.breed ?? ''].filter(Boolean);
      let relevance = scoreSearchMatch(query, tokens, {
        title,
        subtitle: row.arabicLocation || row.location,
        description,
        category: row.marketCategory?.nameAr ?? row.category,
        keywords,
        createdAt: row.createdAt,
        boost:
          (isFeaturedActive(row) ? 2 : 0) + (isPromotedActive(row) ? 1 : 0),
      });
      relevance += scoreAliasMatch(tokens, expansions, {
        title,
        description,
        keywords,
      });
      if (dict) {
        // Probabilistic, internal only: never returned to clients as fact.
        const rowMeta = toRankMetadata(
          dict.extractMetadata(
            `${title} ${row.breed ?? ''} ${row.age ?? ''} ${description ?? ''}`,
          ),
        );
        relevance += scoreMetadataMatch(
          intent,
          rowMeta,
          LISTING_CATEGORY_TO_ANIMAL[row.category as string] ?? null,
        );
      }
      relevance = Math.round(relevance * 100) / 100;
      return {
        type: 'listings' as const,
        id: row.id,
        title: row.arabicTitle || row.title,
        subtitle: row.arabicLocation || row.location,
        imageUrl: row.thumbnailUrl ?? row.images?.[0] ?? null,
        relevance,
        createdAt: row.createdAt.toISOString(),
        data: row as unknown as Record<string, unknown>,
      };
    });
    return rankSearchResults(scored);
  }

  private mapPosts(
    query: string,
    tokens: string[],
    rows: Awaited<ReturnType<UnifiedSearchRepository['searchPosts']>>,
    expansions: RankAlternative[][] = [],
  ): SearchResultItem[] {
    const scored = rows.map((row) => {
      const body = row.arabicContent || row.content;
      const relevance =
        scoreSearchMatch(query, tokens, {
          title: body.slice(0, 120),
          description: body,
          createdAt: row.createdAt,
        }) +
        scoreAliasMatch(tokens, expansions, {
          title: body.slice(0, 120),
          description: body,
        });
      return {
        type: 'posts' as const,
        id: row.id,
        title: body.slice(0, 140),
        subtitle:
          row.author.arabicName ||
          row.author.displayName ||
          row.author.username,
        imageUrl: row.images?.[0] ?? null,
        relevance,
        createdAt: row.createdAt.toISOString(),
        data: row as unknown as Record<string, unknown>,
      };
    });
    return rankSearchResults(scored);
  }

  private mapNews(
    query: string,
    tokens: string[],
    rows: Awaited<ReturnType<UnifiedSearchRepository['searchNews']>>,
  ): SearchResultItem[] {
    const scored = rows.map((row) => {
      const relevance = scoreSearchMatch(
        query,
        tokens,
        {
          title: row.titleAr,
          description: row.bodyAr,
          createdAt: row.publishedAt ?? row.createdAt,
        },
        { title: 50, description: 10 },
      );
      return {
        type: 'news' as const,
        id: row.id,
        title: row.titleAr,
        subtitle: row.bodyAr.slice(0, 100),
        imageUrl: row.imageUrl,
        relevance,
        createdAt: (row.publishedAt ?? row.createdAt).toISOString(),
        data: row as unknown as Record<string, unknown>,
      };
    });
    return rankSearchResults(scored);
  }

  private mapServices(
    query: string,
    tokens: string[],
    rows: Awaited<ReturnType<UnifiedSearchRepository['searchServices']>>,
  ): SearchResultItem[] {
    const scored = rows.map((row) => {
      const relevance = scoreSearchMatch(
        query,
        tokens,
        {
          title: row.title,
          description: row.description,
          category: row.category,
          createdAt: row.createdAt,
        },
        { category: 10 },
      );
      return {
        type: 'services' as const,
        id: row.id,
        title: row.title,
        subtitle: row.category,
        imageUrl: null,
        relevance,
        createdAt: row.createdAt.toISOString(),
        data: row as unknown as Record<string, unknown>,
      };
    });
    return rankSearchResults(scored);
  }

  private mapUsers(
    query: string,
    tokens: string[],
    rows: Awaited<ReturnType<UnifiedSearchRepository['searchUsers']>>,
  ): SearchResultItem[] {
    const scored = rows.map((row) => {
      const relevance = scoreSearchMatch(query, tokens, {
        title: row.arabicName || row.displayName || row.username,
        subtitle: row.username,
        description: row.bio,
        createdAt: row.createdAt,
        boost: row.verified ? 1 : 0,
      });
      return {
        type: 'users' as const,
        id: row.id,
        title: row.arabicName || row.displayName || row.username,
        subtitle: `@${row.username}`,
        imageUrl: row.avatar,
        relevance,
        createdAt: row.createdAt.toISOString(),
        data: row as unknown as Record<string, unknown>,
      };
    });
    return rankSearchResults(scored);
  }
}
