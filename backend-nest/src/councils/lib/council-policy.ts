import type { CouncilMemberRole } from '@prisma/client';

/** «المجالس»: 4 × 3 stage. The owner occupies one of the seats. */
export const COUNCIL_MAX_SPEAKERS = 12;
/** Removing someone from a council blocks re-joining for this long. */
export const COUNCIL_KICK_MINUTES = 10;
/** After a rejected speak request the user waits this long before asking again. */
export const COUNCIL_REQUEST_COOLDOWN_MS = 60_000;
/** A council whose owner has not been seen for this long is ended automatically. */
export const COUNCIL_HOST_ABSENT_END_MS = 30 * 60_000;
/** Stage seats of speakers absent (no socket heartbeat) for this long are freed. */
export const COUNCIL_STALE_SPEAKER_MS = 2 * 60_000;

/** A subscriber's room entrance is announced at most once per council in this window. */
export const COUNCIL_ARRIVAL_COOLDOWN_SEC = 10 * 60;
/** Busy rooms: at most one entrance announcement per council in this window. */
export const COUNCIL_ARRIVAL_GAP_SEC = 3;

/**
 * Tier whose room entrance is announced («انضم فلان ✦»): only an active Gold or
 * Blue+ badge (`verifiedTier` is set only while the subscription is active).
 */
export function councilArrivalTier(
  user: { verified?: boolean | null; verifiedTier?: string | null } | null,
): 'gold' | 'blue_plus' | null {
  if (!user || user.verified !== true) return null;
  return user.verifiedTier === 'gold' || user.verifiedTier === 'blue_plus'
    ? user.verifiedTier
    : null;
}

export type CouncilFlags = {
  ownerId: string;
  modCanManageRequests: boolean;
  modCanMute: boolean;
  modCanRemove: boolean;
  modCanBan: boolean;
};

export type MemberLike = {
  userId: string;
  role: CouncilMemberRole;
  seatIndex: number | null;
  mutedByModerator?: boolean;
};

export type CouncilPermissions = {
  isOwner: boolean;
  isModerator: boolean;
  canManageRequests: boolean;
  canMute: boolean;
  canRemove: boolean;
  canBan: boolean;
  canInvite: boolean;
  canManageModerators: boolean;
  canEdit: boolean;
  canEnd: boolean;
};

const NONE: CouncilPermissions = {
  isOwner: false,
  isModerator: false,
  canManageRequests: false,
  canMute: false,
  canRemove: false,
  canBan: false,
  canInvite: false,
  canManageModerators: false,
  canEdit: false,
  canEnd: false,
};

/** Server-side source of truth for what `actorId` may do in a council. */
export function councilPermissions(
  council: CouncilFlags,
  actorId: string | undefined,
  member: Pick<MemberLike, 'role'> | null | undefined,
): CouncilPermissions {
  if (!actorId) return NONE;
  if (council.ownerId === actorId) {
    return {
      isOwner: true,
      isModerator: false,
      canManageRequests: true,
      canMute: true,
      canRemove: true,
      canBan: true,
      canInvite: true,
      canManageModerators: true,
      canEdit: true,
      canEnd: true,
    };
  }
  if (member?.role === 'MODERATOR') {
    return {
      ...NONE,
      isModerator: true,
      canManageRequests: council.modCanManageRequests,
      canMute: council.modCanMute,
      canRemove: council.modCanRemove,
      canBan: council.modCanBan,
      canInvite: true,
    };
  }
  return NONE;
}

/**
 * Whether a manager may act on `target`. Nobody acts on the owner; moderators only
 * act on regular members (speakers, listeners, banned users) — never on other
 * moderators. Nobody moderates themselves.
 */
export function canActOn(
  perms: CouncilPermissions,
  actorId: string,
  target: Pick<MemberLike, 'userId' | 'role'>,
): boolean {
  if (target.userId === actorId) return false;
  if (target.role === 'OWNER') return false;
  if (perms.isOwner) return true;
  if (perms.isModerator) return target.role !== 'MODERATOR';
  return false;
}

export function isOnStage(member: Pick<MemberLike, 'seatIndex'> | null) {
  return member?.seatIndex !== null && member?.seatIndex !== undefined;
}

/** Agora role derived from the database: only unmuted members on stage may publish. */
export function rtcRoleFor(
  member: MemberLike | null | undefined,
): 'publisher' | 'subscriber' {
  if (!member || member.role === 'BANNED') return 'subscriber';
  if (!isOnStage(member)) return 'subscriber';
  if (member.mutedByModerator) return 'subscriber';
  return 'publisher';
}

/** Lowest free seat (0..11) or null when the stage is full. */
export function firstFreeSeat(taken: Array<number | null>): number | null {
  const used = new Set(taken.filter((s): s is number => s !== null));
  if (used.size >= COUNCIL_MAX_SPEAKERS) return null;
  for (let i = 0; i < COUNCIL_MAX_SPEAKERS; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

/** Role after leaving the stage: moderators stay moderators, speakers become listeners. */
export function roleOffStage(role: CouncilMemberRole): CouncilMemberRole {
  return role === 'SPEAKER' ? 'LISTENER' : role;
}

/** Role when taking a seat: listeners become speakers, owner/moderators keep their role. */
export function roleOnStage(role: CouncilMemberRole): CouncilMemberRole {
  return role === 'LISTENER' ? 'SPEAKER' : role;
}
