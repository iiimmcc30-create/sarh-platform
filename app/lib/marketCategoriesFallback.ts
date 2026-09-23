import type { MarketCategory } from '@/services/categories';

/**
 * Bundled taxonomy — mirrors DB seed (used when /api/categories is unavailable).
 * IDs match migration `20260812140000_market_categories`.
 */
export const MARKET_CATEGORIES_FALLBACK: MarketCategory[] = [
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    nameAr: 'المواشي',
    slug: 'livestock',
    icon: 'paw',
    emoji: '🐪',
    parentId: null,
    sortOrder: 0,
    isActive: true,
    requiresWeight: false,
    legacyCategory: 'livestock',
    children: [
      { id: 'a2000000-0000-4000-8000-000000000001', nameAr: 'إبل', slug: 'camels', icon: 'paw', emoji: '🐪', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 0, isActive: true, requiresWeight: false, legacyCategory: 'camels' },
      { id: 'a2000000-0000-4000-8000-000000000002', nameAr: 'أغنام', slug: 'sheep', icon: 'paw', emoji: '🐑', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 1, isActive: true, requiresWeight: false, legacyCategory: 'sheep' },
      { id: 'a2000000-0000-4000-8000-000000000003', nameAr: 'ماعز', slug: 'goats', icon: 'paw', emoji: '🐐', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 2, isActive: true, requiresWeight: false, legacyCategory: 'goats' },
      { id: 'a2000000-0000-4000-8000-000000000004', nameAr: 'أبقار', slug: 'cows', icon: 'paw', emoji: '🐄', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 3, isActive: true, requiresWeight: false, legacyCategory: 'cows' },
      { id: 'a2000000-0000-4000-8000-000000000005', nameAr: 'خيول', slug: 'horses', icon: 'paw', emoji: '🐎', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 4, isActive: true, requiresWeight: false, legacyCategory: 'horses' },
      { id: 'a2000000-0000-4000-8000-000000000006', nameAr: 'دواجن', slug: 'birds', icon: 'paw', emoji: '🐔', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 5, isActive: true, requiresWeight: false, legacyCategory: 'birds' },
      { id: 'a2000000-0000-4000-8000-000000000007', nameAr: 'أخرى', slug: 'livestock-other', icon: 'paw', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000001', sortOrder: 6, isActive: true, requiresWeight: false, legacyCategory: 'birds' },
    ],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    nameAr: 'الأعلاف',
    slug: 'feed',
    icon: 'leaf',
    emoji: '🌾',
    parentId: null,
    sortOrder: 1,
    isActive: true,
    requiresWeight: false,
    legacyCategory: 'feed',
    children: [
      { id: 'a2000000-0000-4000-8000-000000000011', nameAr: 'أعلاف مواشي', slug: 'livestock-feed', icon: 'leaf', emoji: '🌾', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 0, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000012', nameAr: 'شعير', slug: 'barley', icon: 'leaf', emoji: '🌾', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 1, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000013', nameAr: 'تبن', slug: 'hay', icon: 'leaf', emoji: '🌾', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 2, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000014', nameAr: 'برسيم', slug: 'clover', icon: 'leaf', emoji: '🍀', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 3, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000015', nameAr: 'أعلاف مركزة', slug: 'concentrate', icon: 'leaf', emoji: '🥣', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 4, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000016', nameAr: 'مكملات غذائية', slug: 'supplements', icon: 'leaf', emoji: '💊', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 5, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
      { id: 'a2000000-0000-4000-8000-000000000017', nameAr: 'أخرى', slug: 'feed-other', icon: 'leaf', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000002', sortOrder: 6, isActive: true, requiresWeight: false, legacyCategory: 'feed' },
    ],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000003',
    nameAr: 'النقل',
    slug: 'transport',
    icon: 'truck',
    emoji: '🚚',
    parentId: null,
    sortOrder: 2,
    isActive: true,
    requiresWeight: false,
    legacyCategory: 'transport',
    children: [
      { id: 'a2000000-0000-4000-8000-000000000021', nameAr: 'نقل مواشي', slug: 'livestock-transport', icon: 'truck', emoji: '🚚', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 0, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
      { id: 'a2000000-0000-4000-8000-000000000022', nameAr: 'نقل أعلاف', slug: 'feed-transport', icon: 'truck', emoji: '🚚', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 1, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
      { id: 'a2000000-0000-4000-8000-000000000023', nameAr: 'نقل مبرد', slug: 'cold-transport', icon: 'truck', emoji: '❄️', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 2, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
      { id: 'a2000000-0000-4000-8000-000000000024', nameAr: 'نقل عام', slug: 'general-transport', icon: 'truck', emoji: '🚛', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 3, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
      { id: 'a2000000-0000-4000-8000-000000000025', nameAr: 'سطحات وونش', slug: 'flatbed-winch', icon: 'truck', emoji: '🔧', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 4, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
      { id: 'a2000000-0000-4000-8000-000000000026', nameAr: 'أخرى', slug: 'transport-other', icon: 'truck', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000003', sortOrder: 5, isActive: true, requiresWeight: false, legacyCategory: 'transport' },
    ],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000004',
    nameAr: 'الذبائح',
    slug: 'slaughter',
    icon: 'restaurant',
    emoji: '🥩',
    parentId: null,
    sortOrder: 3,
    isActive: true,
    requiresWeight: true,
    legacyCategory: 'slaughter',
    children: [
      { id: 'a2000000-0000-4000-8000-000000000031', nameAr: 'ذبائح أغنام', slug: 'sheep-carcass', icon: 'restaurant', emoji: '🥩', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 0, isActive: true, requiresWeight: true, legacyCategory: 'sheep' },
      { id: 'a2000000-0000-4000-8000-000000000032', nameAr: 'ذبائح ماعز', slug: 'goat-carcass', icon: 'restaurant', emoji: '🥩', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 1, isActive: true, requiresWeight: true, legacyCategory: 'slaughter' },
      { id: 'a2000000-0000-4000-8000-000000000033', nameAr: 'ذبائح إبل', slug: 'camel-carcass', icon: 'restaurant', emoji: '🥩', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 2, isActive: true, requiresWeight: true, legacyCategory: 'slaughter' },
      { id: 'a2000000-0000-4000-8000-000000000034', nameAr: 'ذبائح أبقار', slug: 'cow-carcass', icon: 'restaurant', emoji: '🥩', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 3, isActive: true, requiresWeight: true, legacyCategory: 'slaughter' },
      { id: 'a2000000-0000-4000-8000-000000000035', nameAr: 'ذبائح جاهزة', slug: 'ready-carcass', icon: 'restaurant', emoji: '🥩', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 4, isActive: true, requiresWeight: true, legacyCategory: 'slaughter' },
      { id: 'a2000000-0000-4000-8000-000000000036', nameAr: 'أخرى', slug: 'slaughter-other', icon: 'restaurant', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000004', sortOrder: 5, isActive: true, requiresWeight: true, legacyCategory: 'slaughter' },
    ],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    nameAr: 'المعدات',
    slug: 'equipment',
    icon: 'construct',
    emoji: '🔧',
    parentId: null,
    sortOrder: 4,
    isActive: true,
    requiresWeight: false,
    legacyCategory: 'equipment',
    children: [
      { id: 'a2000000-0000-4000-8000-000000000041', nameAr: 'حظائر', slug: 'pens', icon: 'construct', emoji: '🏠', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 0, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000042', nameAr: 'معالف ومشارب', slug: 'feeders-drinkers', icon: 'construct', emoji: '🪣', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 1, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000043', nameAr: 'معدات تربية', slug: 'breeding-equipment', icon: 'construct', emoji: '🔧', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 2, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000044', nameAr: 'أدوات بيطرية', slug: 'vet-tools', icon: 'construct', emoji: '🩺', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 3, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000045', nameAr: 'معدات قص وصوف', slug: 'shearing', icon: 'construct', emoji: '✂️', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 4, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000046', nameAr: 'معدات تحميل', slug: 'loading', icon: 'construct', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 5, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
      { id: 'a2000000-0000-4000-8000-000000000047', nameAr: 'أخرى', slug: 'equipment-other', icon: 'construct', emoji: '📦', parentId: 'a1000000-0000-4000-8000-000000000005', sortOrder: 6, isActive: true, requiresWeight: false, legacyCategory: 'equipment' },
    ],
  },
];

const categoryDisplayBySlug = new Map<
  string,
  { emoji?: string | null; icon?: string | null }
>();

function indexCategoryDisplay(cat: MarketCategory) {
  categoryDisplayBySlug.set(cat.slug, { emoji: cat.emoji, icon: cat.icon });
  cat.children?.forEach(indexCategoryDisplay);
}

MARKET_CATEGORIES_FALLBACK.forEach(indexCategoryDisplay);

/** Emoji/icon for market chips when API rows omit display metadata. */
export function resolveCategoryChipDisplay(
  cat: Pick<MarketCategory, 'slug' | 'emoji' | 'icon'>,
): { emoji: string | null; icon: string | null } {
  const fallback = categoryDisplayBySlug.get(cat.slug);
  return {
    emoji: cat.emoji ?? fallback?.emoji ?? null,
    icon: cat.icon ?? fallback?.icon ?? null,
  };
}

/** Legacy enum values accepted by pre-migration API. */
const LEGACY_LISTING_CATEGORIES = new Set([
  'camels',
  'sheep',
  'goats',
  'cows',
  'horses',
  'birds',
  'feed',
  'equipment',
]);

/** Resolve legacy Listing.category enum for API compatibility. */
export function resolveLegacyListingCategory(
  sub: Pick<MarketCategory, 'slug' | 'legacyCategory'>,
  parent?: Pick<MarketCategory, 'slug' | 'legacyCategory' | 'requiresWeight'> | null,
): string {
  const legacy = sub.legacyCategory || parent?.legacyCategory;
  if (legacy && LEGACY_LISTING_CATEGORIES.has(legacy)) return legacy;

  if (parent?.slug === 'livestock' && LEGACY_LISTING_CATEGORIES.has(sub.slug)) {
    return sub.slug;
  }

  if (parent?.slug === 'slaughter') {
    if (sub.slug.includes('sheep')) return 'sheep';
    if (sub.slug.includes('goat')) return 'goats';
    if (sub.slug.includes('camel')) return 'camels';
    if (sub.slug.includes('cow')) return 'cows';
    return 'sheep';
  }

  if (parent?.slug === 'transport') return 'equipment';
  if (parent?.slug === 'feed') return 'feed';
  if (parent?.slug === 'equipment') return 'equipment';

  return 'sheep';
}

/** Client-side filter when API ignores categoryId/subcategoryId (legacy backend). */
export function listingMatchesMarketSelection(
  listing: { category: string; categoryId?: string; subcategoryId?: string },
  parent: MarketCategory,
  sub?: MarketCategory | null,
): boolean {
  if (sub && listing.subcategoryId === sub.id) return true;
  if (!sub && listing.categoryId === parent.id) return true;

  if (sub) {
    const legacy = resolveLegacyListingCategory(sub, parent);
    if (listing.category === legacy) return true;
    if (parent.slug === 'livestock') {
      if (listing.category === sub.slug) return true;
      if (sub.legacyCategory && listing.category === sub.legacyCategory) return true;
    }
    if (parent.slug === 'slaughter' && listing.category === 'slaughter') return true;
    return false;
  }

  const parentLegacy = parent.legacyCategory || parent.slug;
  if (listing.category === parentLegacy) return true;
  if (parent.slug === 'livestock') {
    return ['camels', 'sheep', 'goats', 'cows', 'horses', 'birds'].includes(listing.category);
  }
  return false;
}
