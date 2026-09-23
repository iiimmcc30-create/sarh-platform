export type HomeExploreDestinationKey =
  | 'community'
  | 'listings'
  | 'services'
  | 'news'
  | 'live'
  | 'promote';

export type HomeExploreCard = {
  id?: string;
  destination: HomeExploreDestinationKey;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  route: string;
  sortOrder?: number;
  isActive?: boolean;
  requiresPaidServices?: boolean;
};

const CATALOG: Record<
  HomeExploreDestinationKey,
  Omit<HomeExploreCard, 'destination' | 'id' | 'sortOrder' | 'isActive'>
> = {
  community: {
    titleAr: 'مجتمع سرح',
    descriptionAr: 'نقاشات-تجارب-اسئلة-معرفه',
    icon: 'people-outline',
    route: '/(tabs)/posts',
  },
  listings: {
    titleAr: 'السوق',
    descriptionAr: 'اعلانات البيع والشراء والمنتجات',
    icon: 'pricetag-outline',
    route: '/(tabs)/market',
  },
  services: {
    titleAr: 'خدمات وزارة البيئة والمياه والزراعة',
    descriptionAr: 'الخدمات الإلكترونية - التراخيص - التصاريح',
    icon: 'briefcase-outline',
    route: '/ministry',
  },
  news: {
    titleAr: 'قطاع الأخبار',
    descriptionAr: 'اخبار الوزارة-القرارات-الفعاليات',
    icon: 'newspaper-outline',
    route: '/news',
  },
  live: {
    titleAr: 'البث المباشر',
    descriptionAr: 'بثوث مباشرة من السوق',
    icon: 'videocam-outline',
    route: '/(tabs)/live',
  },
  promote: {
    titleAr: 'تعزيز سرح',
    descriptionAr: 'روّج إعلانك وزد ظهوره',
    icon: 'megaphone-outline',
    route: '/promote',
    requiresPaidServices: true,
  },
};

export const FALLBACK_HOME_EXPLORE: HomeExploreCard[] = (
  ['community', 'listings', 'services', 'news'] as HomeExploreDestinationKey[]
).map((destination, sortOrder) => ({
  destination,
  sortOrder,
  isActive: true,
  ...CATALOG[destination],
}));

/** Explore cards that use the official Sarh mark instead of a catalog Lucide icon. */
export const EXPLORE_SARH_LOGO_DESTINATIONS: HomeExploreDestinationKey[] = [
  'community',
  'listings',
  'services',
  'news',
];

export function usesExploreSarhLogoMark(destination: HomeExploreDestinationKey): boolean {
  return EXPLORE_SARH_LOGO_DESTINATIONS.includes(destination);
}

/** First row takes the extra card when the count is odd — matches 3+2 for the default five. */
export function splitExploreRows<T>(items: T[]): { top: T[]; bottom: T[] } {
  if (items.length <= 1) return { top: items, bottom: [] };
  const mid = Math.ceil(items.length / 2);
  return { top: items.slice(0, mid), bottom: items.slice(mid) };
}

/** Visual order for the 2×2 home grid (matches reference layout). */
export const EXPLORE_GRID_DESTINATION_ORDER: HomeExploreDestinationKey[] = [
  'listings',
  'community',
  'news',
];

/** Ministry/services card spans full width below the 2×2 grid. */
export function partitionExploreSections(sections: HomeExploreCard[]): {
  grid: HomeExploreCard[];
  featured: HomeExploreCard | null;
} {
  const featured = sections.find((s) => s.destination === 'services') ?? null;
  const gridPool = sections.filter((s) => s.destination !== 'services');
  const byDest = new Map(gridPool.map((s) => [s.destination, s]));
  const grid = EXPLORE_GRID_DESTINATION_ORDER.map((d) => byDest.get(d)).filter(
    (s): s is HomeExploreCard => Boolean(s),
  );
  for (const item of gridPool) {
    if (!grid.some((g) => g.destination === item.destination)) {
      grid.push(item);
    }
  }
  return { grid, featured };
}

export function resolveExploreCard(
  raw: Omit<Partial<HomeExploreCard>, 'destination'> & { destination?: string },
): HomeExploreCard | null {
  const key = raw.destination as HomeExploreDestinationKey;
  const meta = CATALOG[key];
  if (!meta) return null;
  return {
    id: raw.id,
    destination: key,
    titleAr: meta.titleAr,
    descriptionAr: meta.descriptionAr,
    icon: meta.icon,
    route: meta.route,
    sortOrder: raw.sortOrder,
    isActive: raw.isActive,
    requiresPaidServices: meta.requiresPaidServices,
  };
}
