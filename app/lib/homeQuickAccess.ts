import type { ImageSourcePropType } from 'react-native';
import { MEWA_FALLBACK_AVATAR } from '@/constants/branding';

export type HomeQuickAccessHref =
  | string
  | { pathname: string; params?: Record<string, string> };

export type HomeQuickAccessItem = {
  key: string;
  label: string;
  href: HomeQuickAccessHref;
  icon?: string;
  iconTone?: 'rose' | 'leaf' | 'silver' | 'primary';
  logo?: ImageSourcePropType;
};

/**
 * Home quick-access shortcuts.
 * Append items here to extend the rail — do not hard-code chips in the layout.
 * Every href must already exist as a real in-app route.
 */
export const HOME_QUICK_ACCESS_ITEMS: HomeQuickAccessItem[] = [
  {
    key: 'services',
    label: 'الخدمات',
    href: { pathname: '/ministry', params: { tab: 'services' } },
    logo: MEWA_FALLBACK_AVATAR,
  },
  {
    key: 'favorites',
    label: 'المفضلة',
    href: '/favorites',
    icon: 'heart',
    iconTone: 'rose',
  },
  {
    key: 'feed-suppliers',
    label: 'الموردين',
    href: '/feed-suppliers',
    icon: 'leaf',
    iconTone: 'leaf',
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    href: '/settings',
    icon: 'settings-outline',
    iconTone: 'silver',
  },
];

export const HOME_LATEST_LISTINGS_LIMIT = 10;
export const HOME_FEED_SUPPLIERS_PREVIEW_LIMIT = 4;

export const HOME_BANNER_CTA_LABEL = 'تصفح الموردين';
export const HOME_BANNER_CTA_HREF = '/feed-suppliers';
export const HOME_BANNER_SUBTITLE_AR = 'موردو الأعلاف في مكان واحد';
export const HOME_SEARCH_PLACEHOLDER = 'ابحث في السوق أو المحتوى...';
export const HOME_TAB_RESELECT_EVENT = 'sarh:homeTabReselect';
