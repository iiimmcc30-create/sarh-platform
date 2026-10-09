/**
 * X-style follow capsule state for a user row (followers / following lists).
 *   - own row               → no button
 *   - I follow them          → «متابَع» (outlined)
 *   - they follow me only    → «رد المتابعة» (filled)
 *   - otherwise              → «متابعة» (filled)
 */
export type FollowRelation = {
  isFollowing: boolean;
  followsYou?: boolean;
};

export type FollowButtonState = {
  title: 'متابَع' | 'رد المتابعة' | 'متابعة';
  variant: 'primary' | 'secondary';
  kind: 'following' | 'follow_back' | 'follow';
};

export function resolveFollowButton(
  relation: FollowRelation,
  isSelf: boolean,
): FollowButtonState | null {
  if (isSelf) return null;
  if (relation.isFollowing) return { title: 'متابَع', variant: 'secondary', kind: 'following' };
  if (relation.followsYou) return { title: 'رد المتابعة', variant: 'primary', kind: 'follow_back' };
  return { title: 'متابعة', variant: 'primary', kind: 'follow' };
}

/** Small «يتابعك» tag beside the @handle — redundant on the viewer's own followers tab. */
export function showFollowsYouTag(
  relation: FollowRelation,
  isSelf: boolean,
  isOwnFollowersTab: boolean,
): boolean {
  return !isSelf && relation.followsYou === true && !isOwnFollowersTab;
}
