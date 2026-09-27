import type { Listing, Post } from '@/services/types';

/**
 * Sidebar "العلامات المرجعية" block - pure helpers (no RN imports).
 * Favorites = listings from the existing listing-favorites store.
 * Saved = posts from the existing post bookmarks. The two never mix.
 */
export const SIDEBAR_BOOKMARKS_KEY = 'bookmarks';
export const SIDEBAR_BOOKMARKS_TITLE = 'العلامات المرجعية';
/** The bookmarks block renders directly under this primary row ("إضافة عرض"). */
export const SIDEBAR_BOOKMARKS_AFTER_KEY = 'create-listing';
/** Compact preview - keeps the sidebar light. */
export const SIDEBAR_BOOKMARKS_LIMIT = 12;

export type SidebarBookmarkSection = 'favorites' | 'saved';

export type SidebarBookmarkSectionDef = {
  key: SidebarBookmarkSection;
  label: string;
  kind: 'listing' | 'post';
  empty: string;
};

export const SIDEBAR_BOOKMARK_SECTIONS: readonly SidebarBookmarkSectionDef[] = [
  { key: 'favorites', label: 'المفضلة', kind: 'listing', empty: 'لا توجد عروض في المفضلة بعد' },
  { key: 'saved', label: 'المحفوظات', kind: 'post', empty: 'لا توجد منشورات محفوظة بعد' },
];

export type SidebarListingBookmark = {
  kind: 'listing';
  id: string;
  title: string;
  image?: string;
  price: number;
  currency: string;
};

export type SidebarPostBookmark = {
  kind: 'post';
  id: string;
  title: string;
  image?: string;
  authorName: string;
};

export type SidebarBookmarkItem = SidebarListingBookmark | SidebarPostBookmark;

export type SidebarBookmarksSlot = { key: typeof SIDEBAR_BOOKMARKS_KEY; slot: true };

export function isSidebarBookmarksSlot(item: { key: string }): item is SidebarBookmarksSlot {
  return (item as Partial<SidebarBookmarksSlot>).slot === true && item.key === SIDEBAR_BOOKMARKS_KEY;
}

/** Inserts the bookmarks block right after "إضافة عرض" (order of other rows unchanged). */
export function withSidebarBookmarks<T extends { key: string }>(
  items: readonly T[],
): Array<T | SidebarBookmarksSlot> {
  const out: Array<T | SidebarBookmarksSlot> = [];
  for (const item of items) {
    out.push(item);
    if (item.key === SIDEBAR_BOOKMARKS_AFTER_KEY) {
      out.push({ key: SIDEBAR_BOOKMARKS_KEY, slot: true });
    }
  }
  return out;
}

export function sidebarBookmarkSection(key: SidebarBookmarkSection): SidebarBookmarkSectionDef {
  return SIDEBAR_BOOKMARK_SECTIONS.find((s) => s.key === key) ?? SIDEBAR_BOOKMARK_SECTIONS[0];
}

export function sidebarBookmarkEmptyText(key: SidebarBookmarkSection): string {
  return sidebarBookmarkSection(key).empty;
}

/** Post bookmarks are kept in insertion order - newest last. Show newest first. */
export function savedPostIdsNewestFirst(ids: Iterable<string>): string[] {
  return Array.from(ids).reverse();
}

/**
 * Resolve ordered ids against the in-memory cache first, then per-id fetches.
 * `fetched[id] === null` means a fetch already failed (deleted / unavailable) - skipped.
 */
export function resolveBookmarked<T extends { id: string }>(
  ids: readonly string[],
  cached: readonly T[],
  fetched: Readonly<Record<string, T | null>>,
  limit = SIDEBAR_BOOKMARKS_LIMIT,
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

function firstText(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

export function listingBookmarkItem(listing: Listing): SidebarListingBookmark {
  return {
    kind: 'listing',
    id: listing.id,
    title: firstText(listing.arabicTitle, listing.title),
    image: firstText(listing.images?.[0], listing.thumbnailUrl) || undefined,
    price: listing.price,
    currency: listing.currency || 'SAR',
  };
}

export function postBookmarkItem(post: Post): SidebarPostBookmark {
  const media = [...(post.media ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const mediaThumb = media ? (media.type === 'IMAGE' ? media.url : media.posterUrl ?? undefined) : undefined;
  return {
    kind: 'post',
    id: post.id,
    title: firstText(post.arabicContent, post.content),
    image: firstText(mediaThumb, post.images?.[0], post.image) || undefined,
    authorName: firstText(post.author?.arabicName, post.author?.displayName, post.author?.username),
  };
}

/** Favorites only ever yields listings; saved only ever yields posts. */
export function sidebarBookmarkItems(
  section: SidebarBookmarkSection,
  source: { listings?: readonly Listing[]; posts?: readonly Post[] },
): SidebarBookmarkItem[] {
  if (section === 'favorites') return (source.listings ?? []).map(listingBookmarkItem);
  return (source.posts ?? []).map(postBookmarkItem);
}