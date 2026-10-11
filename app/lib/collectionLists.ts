import type { Collection } from '@/services/collections';

/** Optimistic follow patch. The server count replaces this when the request returns. */
export function applyCollectionFollow(collection: Collection, following: boolean): Collection {
  if (collection.isFollowing === following) return collection;
  const delta = following ? 1 : -1;
  return {
    ...collection,
    isFollowing: following,
    followersCount: Math.max(0, collection.followersCount + delta),
  };
}

export function sortPinnedFirst<T extends { id: string }>(rows: T[], pinned: ReadonlySet<string>): T[] {
  if (pinned.size === 0) return rows;
  const top: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    if (pinned.has(row.id)) top.push(row);
    else rest.push(row);
  }
  return top.length === 0 ? rows : [...top, ...rest];
}

export function togglePinnedId(ids: readonly string[], id: string, pinned: boolean): string[] {
  const next = ids.filter((item) => item !== id);
  if (pinned) next.unshift(id);
  return next;
}
