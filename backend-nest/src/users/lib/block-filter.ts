/**
 * Apple 1.2 / two-way block helpers shared by listings, posts and stories.
 * A block (either direction) hides each side's content from the other and
 * stops every interaction (comment, reply, rate, react, follow, message).
 */

type CommentLike = {
  id: string;
  authorId?: string | null;
  parentId?: string | null;
};

/**
 * Drops comments written by blocked accounts, and replies hanging under a
 * dropped top-level comment (replies are one level deep).
 */
export function filterBlockedComments<T extends CommentLike>(
  comments: T[],
  blockedIds: Iterable<string>,
): T[] {
  const blocked = new Set(blockedIds);
  if (blocked.size === 0) return comments;
  const dropped = new Set<string>();
  for (const c of comments) {
    if (c.authorId && blocked.has(c.authorId)) dropped.add(c.id);
  }
  if (dropped.size === 0) return comments;
  return comments.filter(
    (c) => !dropped.has(c.id) && !(c.parentId && dropped.has(c.parentId)),
  );
}
