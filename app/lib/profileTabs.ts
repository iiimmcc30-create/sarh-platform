export type ProfileTabKey = 'posts' | 'ads' | 'replies' | 'reposts' | 'likes';

export type ProfileTabDef = {
  key: ProfileTabKey;
  label: string;
};

const SHARED_TABS: ProfileTabDef[] = [
  { key: 'posts', label: 'المنشورات' },
  { key: 'ads', label: 'الإعلانات' },
  { key: 'replies', label: 'الردود' },
  { key: 'reposts', label: 'إعادة النشر' },
];

const LIKES_TAB: ProfileTabDef = { key: 'likes', label: 'الإعجابات' };

export function getProfileTabs(isOwnProfile: boolean): ProfileTabDef[] {
  return isOwnProfile ? [...SHARED_TABS, LIKES_TAB] : SHARED_TABS;
}
