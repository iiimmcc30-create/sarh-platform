import { Injectable } from '@nestjs/common';
import { Prisma, type ListingCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeleted } from '../../common/utils/soft-delete.util';
import { rankByEffectiveBoost } from '../../listings/boost/boost-effective-state';
import { searchTextVariants } from '../lib/arabic-search.util';

export type ListingSearchFilters = {
  categoryId?: string;
  subcategoryId?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  region?: string;
  /** Advanced: ListingCategory enum value (explicit request only). */
  listingCategory?: string;
  /** Advanced: breed text (explicit request only). */
  breed?: string;
};

/**
 * Optional dictionary expansions: `expansions[i]` are alternative terms for
 * `tokens[i]` (aliases / related). Each token still has to match - via
 * itself OR one of its alternatives - so expansion never widens to unrelated
 * rows. Variants per alternative are capped to keep the query small.
 */
export type TokenExpansions = string[][];

const MAX_VARIANTS_PER_ALTERNATIVE = 4;

function tokenVariants(token: string, alternatives: string[] = []): string[] {
  const out = new Set<string>(searchTextVariants(token));
  for (const alt of alternatives) {
    for (const v of searchTextVariants(alt).slice(
      0,
      MAX_VARIANTS_PER_ALTERNATIVE,
    )) {
      out.add(v);
    }
  }
  return [...out];
}

const LISTING_SELECT = {
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
} satisfies Prisma.ListingSelect;

const POST_SEARCH_SELECT = {
  id: true,
  content: true,
  arabicContent: true,
  image: true,
  images: true,
  likesCount: true,
  repostsCount: true,
  commentsCount: true,
  viewsCount: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      arabicName: true,
      avatar: true,
      verified: true,
    },
  },
} satisfies Prisma.PostSelect;

function listingTokenConditions(
  tokens: string[],
  expansions: TokenExpansions = [],
): Prisma.ListingWhereInput[] {
  return tokens.map((token, i) => {
    const variants = tokenVariants(token, expansions[i]);
    const ors: Prisma.ListingWhereInput[] = [];
    for (const v of variants) {
      ors.push(
        { arabicTitle: { contains: v } },
        { title: { contains: v, mode: 'insensitive' } },
        { arabicDescription: { contains: v } },
        { description: { contains: v, mode: 'insensitive' } },
        { arabicLocation: { contains: v } },
        { location: { contains: v, mode: 'insensitive' } },
        { breed: { contains: v, mode: 'insensitive' } },
      );
    }
    return { OR: ors };
  });
}

@Injectable()
export class UnifiedSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchListings(
    tokens: string[],
    filters: ListingSearchFilters,
    skip: number,
    take: number,
    expansions: TokenExpansions = [],
  ) {
    const where: Prisma.ListingWhereInput = {
      status: 'active',
      ...notDeleted,
    };

    if (filters.country) {
      where.country = filters.country as Prisma.EnumCountryFilter;
    }
    if (filters.minPrice != null || filters.maxPrice != null) {
      where.price = {};
      if (filters.minPrice != null) where.price.gte = filters.minPrice;
      if (filters.maxPrice != null) where.price.lte = filters.maxPrice;
    }

    const andFilters: Prisma.ListingWhereInput[] = [];

    if (filters.subcategoryId) {
      andFilters.push({ subcategoryId: filters.subcategoryId });
    } else if (filters.categoryId) {
      andFilters.push({
        OR: [
          { categoryId: filters.categoryId },
          { marketSubcategory: { parentId: filters.categoryId } },
        ],
      });
    }

    if (filters.region?.trim()) {
      const region = filters.region.trim();
      andFilters.push({
        OR: [
          { arabicLocation: { contains: region } },
          { location: { contains: region, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.listingCategory) {
      andFilters.push({
        category: filters.listingCategory as ListingCategory,
      });
    }

    if (filters.breed?.trim()) {
      const ors: Prisma.ListingWhereInput[] = [];
      for (const v of searchTextVariants(filters.breed.trim())) {
        ors.push(
          { breed: { contains: v, mode: 'insensitive' } },
          { arabicTitle: { contains: v } },
          { arabicDescription: { contains: v } },
        );
      }
      andFilters.push({ OR: ors });
    }

    if (tokens.length > 0) {
      andFilters.push({ AND: listingTokenConditions(tokens, expansions) });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const rows = await this.prisma.listing.findMany({
      where,
      select: LISTING_SELECT,
      skip,
      take,
      orderBy: [
        { pinned: 'desc' },
        { featured: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    // Pinned/Featured by effective state (expired boosts rank as regular).
    return rankByEffectiveBoost(rows);
  }

  searchPosts(
    tokens: string[],
    skip: number,
    take: number,
    expansions: TokenExpansions = [],
  ) {
    const where: Prisma.PostWhereInput = {
      ...notDeleted,
      isHidden: false,
    };

    if (tokens.length > 0) {
      where.AND = tokens.map((token, i) => {
        const variants = tokenVariants(token, expansions[i]);
        return {
          OR: variants.flatMap((v) => [
            { arabicContent: { contains: v } },
            { content: { contains: v, mode: 'insensitive' } },
          ]),
        };
      });
    }

    return this.prisma.post.findMany({
      where,
      select: POST_SEARCH_SELECT,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Hashtag search: rows whose text contains the literal tag (`#حلال_الطيبين`,
   * alef/ta-marbuta tolerant). Callers post-filter with textHasHashtag so a
   * longer tag (`#حلال_الطيبين_2`) is not counted as a match.
   */
  searchPostsByHashtag(tagForms: string[], skip: number, take: number) {
    const variants = new Set<string>();
    for (const form of tagForms) {
      for (const v of searchTextVariants(form)) {
        // searchTextVariants strips `#`/`_` in its normalized seed - keep only
        // literal tag variants.
        if (v.startsWith('#') || v.startsWith('＃')) variants.add(v);
      }
      variants.add(form);
    }
    return this.prisma.post.findMany({
      where: {
        ...notDeleted,
        isHidden: false,
        OR: [...variants].flatMap((v) => [
          { arabicContent: { contains: v } },
          { content: { contains: v, mode: 'insensitive' as const } },
        ]),
      },
      select: POST_SEARCH_SELECT,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  searchNews(tokens: string[], skip: number, take: number) {
    const where: Prisma.EditorialStoryWhereInput = {
      isActive: true,
      ...notDeleted,
    };

    if (tokens.length > 0) {
      where.AND = tokens.map((token) => {
        const variants = searchTextVariants(token);
        return {
          OR: variants.flatMap((v) => [
            { titleAr: { contains: v } },
            { bodyAr: { contains: v } },
          ]),
        };
      });
    }

    return this.prisma.editorialStory.findMany({
      where,
      select: {
        id: true,
        titleAr: true,
        bodyAr: true,
        imageUrl: true,
        publishedAt: true,
        createdAt: true,
      },
      skip,
      take,
      orderBy: [
        { sortOrder: 'asc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  searchServices(tokens: string[], skip: number, take: number) {
    const where: Prisma.ServiceWhereInput = { active: true };

    if (tokens.length > 0) {
      where.AND = tokens.map((token) => {
        const variants = searchTextVariants(token);
        return {
          OR: variants.flatMap((v) => [
            { title: { contains: v, mode: 'insensitive' } },
            { description: { contains: v, mode: 'insensitive' } },
            { category: { contains: v, mode: 'insensitive' } },
          ]),
        };
      });
    }

    return this.prisma.service.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        icon: true,
        externalUrl: true,
        createdAt: true,
      },
      skip,
      take,
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  searchUsers(tokens: string[], skip: number, take: number) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      showInSearch: true,
      deletedAt: null,
    };

    if (tokens.length > 0) {
      where.AND = tokens.map((token) => {
        const variants = searchTextVariants(token);
        return {
          OR: variants.flatMap((v) => [
            { username: { contains: v, mode: 'insensitive' } },
            { displayName: { contains: v, mode: 'insensitive' } },
            { arabicName: { contains: v } },
          ]),
        };
      });
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        arabicName: true,
        avatar: true,
        verified: true,
        bio: true,
        createdAt: true,
        _count: { select: { followers: true } },
      },
      skip,
      take,
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
    });
  }

  suggestPrefixes(prefix: string, limit: number) {
    const like = `${prefix}%`;
    return this.prisma.$queryRaw<
      Array<{ text: string; kind: string; weight: number }>
    >`
      (
        SELECT DISTINCT "arabicTitle" AS text, 'listing'::text AS kind, 3::float AS weight
        FROM "Listing"
        WHERE status = 'active' AND "deletedAt" IS NULL
          AND (
            regexp_replace(
              translate("arabicTitle", 'أإآٱةى', 'ااااهي'),
              '[\u0610-\u061A\u064B-\u065F\u0670\u0640]',
              '',
              'g'
            ) ILIKE ${like}
            OR lower(title) LIKE lower(${like})
          )
        LIMIT ${Math.ceil(limit / 2)}
      )
      UNION ALL
      (
        SELECT DISTINCT title AS text, 'service'::text AS kind, 1::float AS weight
        FROM services
        WHERE active = true AND title ILIKE ${like}
        LIMIT ${Math.ceil(limit / 4)}
      )
      LIMIT ${limit}
    `;
  }
}
