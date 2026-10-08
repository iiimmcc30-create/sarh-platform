import type { Router } from 'expo-router';
import { presentActionSheet, type ActionSheetItem } from '@/lib/actionSheet';
import { safePush } from '@/lib/safeNavigate';
import { MEMBER_OF_TITLE } from '@/services/collections';
import { PROFILE_VIEWS_TITLE } from '@/services/profileViews';

/** Profile ••• menu entry (no profile tab): collections the user was added to as a member. */
export const MEMBER_OF_MENU_ITEM: ActionSheetItem = {
  key: 'member-of',
  label: MEMBER_OF_TITLE,
  icon: 'people-outline',
};

/** Own-profile ••• menu: «من شاهد ملفك» (count is optional secondary text). */
export function profileViewsMenuItem(count?: number | null): ActionSheetItem {
  return {
    key: 'profile-views',
    label: PROFILE_VIEWS_TITLE,
    icon: 'eye-outline',
    subtitle:
      typeof count === 'number' && Number.isFinite(count)
        ? count.toLocaleString('en-US')
        : undefined,
  };
}

/** Opens the SAME Collections page, scrolled to «المضاف إليها» for this user. */
export function openMemberOfCollections(router: Router, userId: string) {
  if (!userId) return;
  safePush(
    { pathname: '/collections', params: { section: 'member-of', userId } },
    undefined,
    router,
  );
}

/** Opens «من شاهد ملفك» (own profile only; the screen handles subscriber gating). */
export function openProfileViews(router: Router) {
  safePush('/profile/views', undefined, router);
}

/** Light ••• menu on the own profile. */
export async function presentOwnProfileMenu(
  router: Router,
  userId: string,
  options?: { profileViewsCount?: number | null },
) {
  const viewsItem = profileViewsMenuItem(options?.profileViewsCount);
  const key = await presentActionSheet({
    title: 'خيارات',
    items: [viewsItem, MEMBER_OF_MENU_ITEM, { key: 'cancel', label: 'إلغاء', cancel: true }],
  });
  if (key === viewsItem.key) openProfileViews(router);
  else if (key === MEMBER_OF_MENU_ITEM.key) openMemberOfCollections(router, userId);
}