export const HOME_EXPLORE_SETTING_KEY = 'home.exploreItems';

export type HomeExploreDestinationKey =
  'community' | 'listings' | 'services' | 'news' | 'live' | 'promote';

export type HomeExploreCatalogEntry = {
  key: HomeExploreDestinationKey;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  /** App route — never entered by admins. */
  route: string;
  requiresPaidServices?: boolean;
};

export const HOME_EXPLORE_CATALOG: HomeExploreCatalogEntry[] = [
  {
    key: 'community',
    titleAr: 'مجتمع سرح',
    descriptionAr: 'نقاشات-تجارب-اسئلة-معرفه',
    icon: 'people-outline',
    route: '/(tabs)/posts',
  },
  {
    key: 'listings',
    titleAr: 'السوق',
    descriptionAr: 'اعلانات البيع والشراء والمنتجات',
    icon: 'pricetag-outline',
    route: '/(tabs)/market',
  },
  {
    key: 'services',
    titleAr: 'خدمات الوزارة',
    descriptionAr: 'الخدمات الالكترونية-التراخيص-التصاريح',
    icon: 'briefcase-outline',
    route: '/ministry',
  },
  {
    key: 'news',
    titleAr: 'قطاع الأخبار',
    descriptionAr: 'اخبار الوزارة-القرارات-الفعاليات',
    icon: 'newspaper-outline',
    route: '/news',
  },
  {
    key: 'live',
    titleAr: 'البث المباشر',
    descriptionAr: 'بثوث مباشرة من السوق',
    icon: 'videocam-outline',
    route: '/(tabs)/live',
  },
  {
    key: 'promote',
    titleAr: 'تعزيز سرح',
    descriptionAr: 'روّج إعلانك وزد ظهوره',
    icon: 'megaphone-outline',
    route: '/promote',
    requiresPaidServices: true,
  },
];

export const DEFAULT_HOME_EXPLORE_DESTINATIONS: HomeExploreDestinationKey[] = [
  'community',
  'listings',
  'services',
  'news',
  'promote',
];

export function getExploreCatalogEntry(
  key: string,
): HomeExploreCatalogEntry | undefined {
  return HOME_EXPLORE_CATALOG.find((item) => item.key === key);
}

export function isExploreDestinationKey(
  key: string,
): key is HomeExploreDestinationKey {
  return HOME_EXPLORE_CATALOG.some((item) => item.key === key);
}
