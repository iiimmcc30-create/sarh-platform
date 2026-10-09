/**
 * Listing comment replies (one level).
 * Who gets the "new reply" notification: the parent comment's author, never
 * the replier themself, and nobody for top-level comments.
 */
export function listingReplyNotifyTarget(
  parentAuthorId: string | null | undefined,
  replierId: string,
): string | null {
  if (!parentAuthorId) return null;
  if (parentAuthorId === replierId) return null;
  return parentAuthorId;
}
