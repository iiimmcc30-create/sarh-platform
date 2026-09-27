/**
 * "العلامات المرجعية" page (/bookmarks) - pure helpers (no RN imports).
 * المفضلة = listings from the existing listing-favorites store (lib/listingFavorite).
 * المحفوظات = posts from the existing post bookmarks (AppContext bookmarkedPosts).
 * The two never mix.
 */
export const BOOKMARKS_TITLE = 'العلامات المرجعية';
export const BOOKMARKS_ROUTE = '/bookmarks';
/** Ids resolved per step; the next step loads when the list nears its end. */
export const BOOKMARKS_PAGE_SIZE = 20;

export type BookmarkTab = 'favorites' | 'saved';

export type BookmarkTabDef = {
  key: BookmarkTab;
  label: string;
  kind: 'listing' | 'post';
  empty: string;
};

export const BOOKMARK_TABS: readonly BookmarkTabDef[] = [
  { key: 'favorites', label: 'المفضلة', kind: 'listing', empty: 'لا توجد عروض في المفضلة بعد' },
  { key: 'saved', label: 'المحفوظات', kind: 'post', empty: 'لا توجد منشورات محفوظة بعد' },
];

export const SAVED_SIGNED_OUT_TEXT = 'سجّل الدخول لعرض منشوراتك المحفوظة';

export function bookmarkEmptyText(key: BookmarkTab): string {
  return (BOOKMARK_TABS.find((t) => t.key === key) ?? BOOKMARK_TABS[0]).empty;
}

/**
 * Horizontal pager math, RTL-aware. In RTL, Yoga lays page 0 out on the RIGHT,
 * but native contentOffset.x / scrollTo({ x }) stay physical (from the left).
 * So in RTL page `i` sits at physical offset (count - 1 - i) * width.
 * Tabs, indicator and visible content all derive from one index through these two.
 * Shared with every swipe-tab pager via lib/tabPager (same implementation).
 */
export { tabPagerIndex as bookmarkPagerIndex, tabPagerOffset as bookmarkPagerOffset } from './tabPager';

/** Post bookmarks are kept in insertion order - newest last. Show newest first. */
export function savedPostIdsNewestFirst(ids: Iterable<string>): string[] {
  return Array.from(ids).reverse();
}

/**
 * Resolve the first `limit` ordered ids against the in-memory cache first, then
 * per-id fetches. `fetched[id] === null` means a fetch already failed (deleted /
 * unavailable) - skipped. `missing` = ids in the window that still need a fetch.
 */
export function resolveBookmarked<T extends { id: string }>(
  ids: readonly string[],
  cached: readonly T[],
  fetched: Readonly<Record<string, T | null>>,
  limit = BOOKMARKS_PAGE_SIZE,
): { items: T[]; missing: string[] } {
  const byId = new Map<string, T>();
  for (const entry of cached) byId.set(entry.id, entry);
  const items: T[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    if (seen.size >= limit) break;
    seen.add(id);
    const hit = byId.get(id) ?? fetched[id];
    if (hit) items.push(hit);
    else if (!(id in fetched)) missing.push(id);
  }
  return { items, missing };
}