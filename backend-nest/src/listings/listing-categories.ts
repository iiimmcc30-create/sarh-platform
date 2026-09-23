import type { ListingCategory } from '@prisma/client';

export const LIVESTOCK_CATEGORIES = [
  'camels',
  'sheep',
  'goats',
  'cows',
  'horses',
] as const;

export type LivestockCategory = (typeof LIVESTOCK_CATEGORIES)[number];

export const LISTING_CATEGORIES = [
  'camels',
  'sheep',
  'goats',
  'cows',
  'horses',
  'birds',
  'feed',
  'equipment',
  'livestock',
  'transport',
  'slaughter',
] as const;

export type ListingCategoryValue = (typeof LISTING_CATEGORIES)[number];

export function isLivestockCategory(
  category: string,
): category is LivestockCategory {
  return (LIVESTOCK_CATEGORIES as readonly string[]).includes(category);
}

export function isSlaughterCategory(category: string): boolean {
  const value = category.toLowerCase();
  return (
    value === 'slaughter' ||
    value.startsWith('slaughter-') ||
    value.endsWith('-carcass')
  );
}

export function isValidListingCategory(
  value: string,
): value is ListingCategoryValue {
  return (LISTING_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Weight is required ONLY for ذبائح (slaughter), or when the market parent
 * has requiresWeight=true. Live livestock no longer require weight.
 */
export function categoryRequiresWeight(
  category: string,
  parentRequiresWeight?: boolean | null,
): boolean {
  return parentRequiresWeight === true || isSlaughterCategory(category);
}

const PARENT_SLUG_TO_LEGACY: Record<string, ListingCategoryValue> = {
  livestock: 'livestock',
  feed: 'feed',
  transport: 'transport',
  slaughter: 'slaughter',
  equipment: 'equipment',
};

/**
 * Resolve legacy Listing.category enum for commissions / compatibility
 * from a market subcategory (and optional parent).
 */
export function resolveLegacyListingCategory(sub: {
  slug: string;
  legacyCategory?: string | null;
  parent?: { slug?: string | null; legacyCategory?: string | null } | null;
}): ListingCategory {
  if (sub.legacyCategory && isValidListingCategory(sub.legacyCategory)) {
    return sub.legacyCategory as ListingCategory;
  }
  if (
    sub.parent?.legacyCategory &&
    isValidListingCategory(sub.parent.legacyCategory)
  ) {
    return sub.parent.legacyCategory as ListingCategory;
  }
  if (sub.parent?.slug && PARENT_SLUG_TO_LEGACY[sub.parent.slug]) {
    return PARENT_SLUG_TO_LEGACY[sub.parent.slug] as ListingCategory;
  }
  if (isValidListingCategory(sub.slug)) {
    return sub.slug as ListingCategory;
  }
  return 'livestock';
}
