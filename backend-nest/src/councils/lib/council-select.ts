import { Prisma } from '@prisma/client';

/** Public identity fields (same shape the feeds use for authors). */
export const COUNCIL_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  verifiedTier: true,
} as const satisfies Prisma.UserSelect;

export type CouncilUser = Prisma.UserGetPayload<{
  select: typeof COUNCIL_USER_SELECT;
}>;

export const COUNCIL_SPEAKER_SELECT = {
  userId: true,
  role: true,
  seatIndex: true,
  micMuted: true,
  mutedByModerator: true,
  user: { select: COUNCIL_USER_SELECT },
} as const satisfies Prisma.CouncilMemberSelect;

export type CouncilSpeakerRow = Prisma.CouncilMemberGetPayload<{
  select: typeof COUNCIL_SPEAKER_SELECT;
}>;
