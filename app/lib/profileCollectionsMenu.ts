import type { Router } from 'expo-router';
import { presentActionSheet, type ActionSheetItem } from '@/lib/actionSheet';
import { safePush } from '@/lib/safeNavigate';
import { MEMBER_OF_TITLE } from '@/services/collections';

/** Profile ••• menu entry (no profile tab): collections the user was added to as a member. */
export const MEMBER_OF_MENU_ITEM: ActionSheetItem = {
  key: 'member-of',
  label: MEMBER_OF_TITLE,
  icon: 'people-outline',
};

/** Opens the SAME Collections page, scrolled to «المضاف إليها» for this user. */
export function openMemberOfCollections(router: Router, userId: string) {
  if (!userId) return;
  safePush(
    { pathname: '/collections', params: { section: 'member-of', userId } },
    undefined,
    router,
  );
}

/** Light ••• menu on the own profile. */
export async function presentOwnProfileMenu(router: Router, userId: string) {
  const key = await presentActionSheet({
    title: 'خيارات',
    items: [MEMBER_OF_MENU_ITEM, { key: 'cancel', label: 'إلغاء', cancel: true }],
  });
  if (key === MEMBER_OF_MENU_ITEM.key) openMemberOfCollections(router, userId);
}
