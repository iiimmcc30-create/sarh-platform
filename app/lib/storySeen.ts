// Local "seen" state for stories: marks a story seen the moment it is shown
// (own stories too — the server never records self-views), so rings flip to the
// seen style immediately and stay so across feed refetches / app restarts.

export type SeenStory = { id: string; seen?: boolean };
export type SeenGroup = { hasUnseen: boolean; stories: SeenStory[] };

/** True when any story in the group is unseen per server flag AND the local set. */
export function groupHasUnseen(group: SeenGroup | null | undefined, local: ReadonlySet<string>): boolean {
  if (!group) return false;
  if (!group.stories?.length) return !!group.hasUnseen;
  return group.stories.some((s) => !s.seen && !local.has(s.id));
}

/** Keep the newest `max` ids (insertion order). */
export function trimSeenIds(ids: string[], max = 500): string[] {
  return ids.length > max ? ids.slice(ids.length - max) : ids;
}
