// SAFAT — Profile-only unified timeline (posts + listings merged by date).
// Scope: used ONLY on profile screens (own profile + public user profile).
// Every other screen (home, market, posts feed) keeps its own separate logic.
import type { Listing, Post } from '@/services/types';

export type TimelineEntry =
  | { kind: 'post'; id: string; createdAtMs: number; data: Post }
  | { kind: 'listing'; id: string; createdAtMs: number; data: Listing };

function toMs(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Merge a user's posts + listings into one feed, newest first (by createdAt). */
export function buildProfileTimeline(posts: Post[], listings: Listing[]): TimelineEntry[] {
  const postEntries: TimelineEntry[] = posts.map((p) => ({
    kind: 'post',
    id: `post-${p.id}`,
    createdAtMs: toMs(p.createdAt),
    data: p,
  }));
  const listingEntries: TimelineEntry[] = listings.map((l) => ({
    kind: 'listing',
    id: `listing-${l.id}`,
    createdAtMs: toMs(l.createdAt),
    data: l,
  }));
  return [...postEntries, ...listingEntries].sort((a, b) => b.createdAtMs - a.createdAtMs);
}
