export type CollectionPreviewUser = {
  id: string;
  username: string;
  avatar: string | null;
};

export type CollectionSocialProof = {
  previewMembers: CollectionPreviewUser[];
  mutualFollower: { username: string } | null;
};

const PREVIEW_LIMIT = 3;

/**
 * Collapse member and mutual-follower rows (already loaded) into one proof per list.
 * Read-only shaping — no new table.
 */
export function groupCollectionSocialProof(
  ids: readonly string[],
  members: readonly { collectionId: string; user: CollectionPreviewUser }[],
  mutual: readonly { collectionId: string; username: string }[],
): Map<string, CollectionSocialProof> {
  const out = new Map<string, CollectionSocialProof>();
  for (const id of ids) {
    out.set(id, { previewMembers: [], mutualFollower: null });
  }
  for (const row of members) {
    const slot = out.get(row.collectionId);
    if (!slot || slot.previewMembers.length >= PREVIEW_LIMIT) continue;
    if (!row.user?.id || !row.user.username) continue;
    slot.previewMembers.push({
      id: row.user.id,
      username: row.user.username,
      avatar: row.user.avatar ?? null,
    });
  }
  for (const row of mutual) {
    const slot = out.get(row.collectionId);
    if (!slot || slot.mutualFollower || !row.username) continue;
    slot.mutualFollower = { username: row.username };
  }
  return out;
}
