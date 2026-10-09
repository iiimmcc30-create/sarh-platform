import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { softDeleteFields } from '../../common/utils/soft-delete.util';

/** Public label shown wherever a deleted account still appears (old comments, chats). */
export const DELETED_ACCOUNT_NAME_AR = 'حساب محذوف';
export const DELETED_ACCOUNT_NAME_EN = 'Deleted account';

/**
 * Tombstone username: unique per account (derived from the id, not the old
 * handle) so the original username is free to register again.
 */
export function deletedUsername(userId: string): string {
  return `deleted_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`;
}

/**
 * Field values that strip every piece of personal data from a User row while
 * keeping the row (and its id) so payments, listing fees, commissions,
 * subscriptions and reviews keep their foreign keys for accounting.
 * `passwordVersion` is bumped so every issued access token fails the guard.
 */
export function anonymizedUserData(userId: string): Prisma.UserUpdateInput {
  return {
    isActive: false,
    ...softDeleteFields(),
    username: deletedUsername(userId),
    email: null,
    emailVerified: false,
    phone: null,
    googleId: null,
    // Random, non-bcrypt value: no password can ever match it again.
    passwordHash: `!deleted:${randomBytes(24).toString('hex')}`,
    passwordVersion: { increment: 1 },
    displayName: DELETED_ACCOUNT_NAME_EN,
    arabicName: DELETED_ACCOUNT_NAME_AR,
    avatar: null,
    coverImage: null,
    bio: null,
    about: null,
    website: null,
    profileLinks: Prisma.DbNull,
    publicPhone: null,
    publicEmail: null,
    birthDate: null,
    fcmToken: null,
    lastSeenAt: null,
    verified: false,
    verifiedTier: null,
    subscriptionBadge: false,
    showInSearch: false,
    allowPrivateMessages: false,
    notificationsEnabled: false,
    notificationPrefs: Prisma.DbNull,
  };
}

type DeletionClient = Pick<
  PrismaClient,
  | 'user'
  | 'userSession'
  | 'userDeviceToken'
  | 'listing'
  | 'accountVerificationRequest'
>;

/**
 * Operations for one `$transaction([...])` that deletes an account:
 * - anonymizes the User row (see `anonymizedUserData`);
 * - revokes every refresh session and push device token;
 * - removes identity documents / national id (verification request cascades
 *   to its documents + timeline);
 * - clears the contact phones copied onto the user's listings.
 * Payments, listing fees, commissions and subscriptions are kept untouched;
 * they now point at an anonymous row.
 */
export function accountDeletionOperations(
  prisma: DeletionClient,
  userId: string,
): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.userDeviceToken.deleteMany({ where: { userId } }),
    prisma.accountVerificationRequest.deleteMany({ where: { userId } }),
    prisma.listing.updateMany({
      where: { sellerId: userId },
      data: { displayPhone: null, contactPhone: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: anonymizedUserData(userId),
    }),
  ];
}
