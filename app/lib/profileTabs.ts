export type ProfileTabKey = 'posts' | 'ads' | 'replies' | 'reposts' | 'likes';

export type ProfileTabDef = {
  key: ProfileTabKey;
  label: string;
  /** AppIcon name (same line set as the feed actions). */
  icon: string;
  /**
   * Selected look: `fill` = solid glyph (closed shapes: heart, tag, bubble);
   * `bold` = heavier stroke (open / lined shapes a fill would hide: document, repeat).
   */
  activeStyle: 'fill' | 'bold';
};

const SHARED_TABS: ProfileTabDef[] = [
  { key: 'posts', label: 'المنشورات', icon: 'document-text', activeStyle: 'bold' },
  { key: 'ads', label: 'الإعلانات', icon: 'pricetag', activeStyle: 'fill' },
  { key: 'replies', label: 'الردود', icon: 'chatbubble-ellipses-outline', activeStyle: 'fill' },
  { key: 'reposts', label: 'إعادة النشر', icon: 'repeat-2', activeStyle: 'bold' },
];

const LIKES_TAB: ProfileTabDef = { key: 'likes', label: 'الإعجابات', icon: 'heart', activeStyle: 'fill' };

export function getProfileTabs(isOwnProfile: boolean): ProfileTabDef[] {
  return isOwnProfile ? [...SHARED_TABS, LIKES_TAB] : SHARED_TABS;
}
