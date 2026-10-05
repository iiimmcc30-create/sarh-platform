import type { ImageSourcePropType } from 'react-native';

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
 * Feed suppliers is intentionally not a shortcut here; its screen, route and
 * the Home banner CTA below stay unchanged.
 */
export const HOME_QUICK_ACCESS_ITEMS: HomeQuickAccessItem[] = [
  {
    // Replaces the former «الخدمات» shortcut; the services page/route stays
    // (reachable from Search).
    key: 'collections',
    label: 'القوائم',
    href: '/collections',
    icon: 'people-outline',
    iconTone: 'primary',
  },
  {
    // Same save icon as the Feed's bookmark action (PostItem, not saved yet).
    key: 'bookmarks',
    label: 'المحفوظات',
    href: '/bookmarks',
    icon: 'bookmark-outline',
    iconTone: 'primary',
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    href: '/settings',
    icon: 'settings-outline',
    iconTone: 'silver',
  },
];

/**
 * Quick-access tile sizing.
 *
 * Why labels were cut: every tile is `flex: 1` of a 3-tile row, so on a
 * 320–360pt phone a tile is only ~91–104pt wide. The fixed chrome (2 × 12
 * padding + 20 icon box + 8 icon gap + 2 border = 54pt) left ~37–50pt for the
 * label, while «المحفوظات» is ~75pt wide at the 15px `label` size (Tajawal
 * 500 ≈ 4.97em), so `numberOfLines={1}` ellipsized it.
 *
 * Fix: keep height 40 / radius / border / equal row, but when the widest label
 * does not fit, use tight padding + a 4pt icon gap and size the label so the
 * widest one fits (never above 15, never below 11).
 */
export const QUICK_ACCESS_LABEL_EM = 5; // widest label (المحفوظات) ≈ 4.97em in Tajawal 500
export const QUICK_ACCESS_FONT_MAX = 15;
export const QUICK_ACCESS_FONT_MIN = 11;
const TILE_BORDER_TOTAL = 2;
const TILE_ICON_BOX = 20;
const RAIL_GAP = 8;

export type QuickAccessTileMetrics = {
  tileWidth: number;
  paddingHorizontal: number;
  iconGap: 'xs' | 'sm';
  fontSize: number;
};

export function resolveQuickAccessTileMetrics(
  contentWidth: number,
  gutter: number,
  count: number = HOME_QUICK_ACCESS_ITEMS.length,
): QuickAccessTileMetrics {
  const n = Math.max(1, count);
  const tileWidth = Math.max(0, (contentWidth - 2 * gutter - RAIL_GAP * (n - 1)) / n);
  const regularBudget = tileWidth - TILE_BORDER_TOTAL - 2 * 12 - TILE_ICON_BOX - 8;
  if (regularBudget >= QUICK_ACCESS_LABEL_EM * QUICK_ACCESS_FONT_MAX) {
    return { tileWidth, paddingHorizontal: 12, iconGap: 'sm', fontSize: QUICK_ACCESS_FONT_MAX };
  }
  const tightBudget = tileWidth - TILE_BORDER_TOTAL - 2 * 4 - TILE_ICON_BOX - 4;
  const fit = Math.floor((tightBudget / QUICK_ACCESS_LABEL_EM) * 2) / 2;
  const fontSize = Math.min(QUICK_ACCESS_FONT_MAX, Math.max(QUICK_ACCESS_FONT_MIN, fit));
  return { tileWidth, paddingHorizontal: 4, iconGap: 'xs', fontSize };
}

export const HOME_LATEST_LISTINGS_LIMIT = 10;
export const HOME_FEED_SUPPLIERS_PREVIEW_LIMIT = 4;

export const HOME_BANNER_CTA_LABEL = 'تصفح الموردين';
export const HOME_BANNER_CTA_HREF = '/feed-suppliers';
export const HOME_BANNER_SUBTITLE_AR = 'موردو الأعلاف في مكان واحد';
export const HOME_SEARCH_PLACEHOLDER = 'ابحث في السوق أو المحتوى...';
export const HOME_TAB_RESELECT_EVENT = 'sarh:homeTabReselect';
