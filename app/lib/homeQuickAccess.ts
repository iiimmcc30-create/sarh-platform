/**
 * Home constants. The Home «الوصول السريع» rail (المجالس / المحفوظات /
 * الإعدادات) was removed; those places stay reachable from the sidebar and
 * the app sidebar. The constants below are still imported elsewhere.
 */

/**
 * Quick-access chips reuse the profile Share / Edit pills' DS button variant
 * (`PROFILE_ACTION_PILL_VARIANT` = SarhButton "secondary"; the chip uses the full
 * pill radius too): dark
 * pill + white label/icon + subtle border, with the same light-mode tokens.
 */
export const HOME_QUICK_ACCESS_CHIP_VARIANT = 'secondary' as const;

export const HOME_LATEST_LISTINGS_LIMIT = 10;
export const HOME_FEED_SUPPLIERS_PREVIEW_LIMIT = 4;

export const HOME_BANNER_CTA_LABEL = 'تصفح الموردين';
export const HOME_BANNER_CTA_HREF = '/feed-suppliers';
export const HOME_BANNER_SUBTITLE_AR = 'موردو الأعلاف في مكان واحد';
export const HOME_SEARCH_PLACEHOLDER = 'ابحث في السوق أو المحتوى...';
export const HOME_TAB_RESELECT_EVENT = 'sarh:homeTabReselect';
