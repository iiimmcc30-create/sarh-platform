import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { softDeleteFields } from '../../common/utils/soft-delete.util';
import { parseCloudinaryUrl } from '../../messages/lib/message-media';
import { getCloudinaryBaseFolder } from '../../shared/lib/storage';

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

/** Placeholder kept where another user's thread / replies still need the row. */
export const DELETED_CONTENT_AR = 'محتوى محذوف';
export const DELETED_LISTING_TITLE_AR = 'إعلان محذوف';
export const DELETED_LISTING_TITLE_EN = 'Deleted listing';

type DeletionClient = Pick<
  PrismaClient,
  | 'user'
  | 'userSession'
  | 'userDeviceToken'
  | 'listing'
  | 'accountVerificationRequest'
  | 'post'
  | 'postMedia'
  | 'postComment'
  | 'listingComment'
  | 'story'
  | 'message'
  | 'liveComment'
  | 'consentRecord'
  | 'mediaDeletionJob'
>;

type MediaClient = Pick<
  PrismaClient,
  | 'user'
  | 'listing'
  | 'post'
  | 'story'
  | 'message'
  | 'accountVerificationRequest'
>;

function isOwnChatUpload(url: string | null | undefined, userId: string) {
  const ref = parseCloudinaryUrl(url);
  if (!ref) return false;
  return ref.publicId.includes(
    `${getCloudinaryBaseFolder()}/messages/${userId}/`,
  );
}

/**
 * Every stored media URL that belongs to the account (read before the
 * deletion transaction): avatar / cover, listing photos + video, post media,
 * stories, chat media the user sent, identity documents.
 */
export async function collectAccountMediaUrls(
  prisma: MediaClient,
  userId: string,
): Promise<string[]> {
  const [user, listings, posts, stories, messages, verification] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { avatar: true, coverImage: true },
      }),
      prisma.listing.findMany({
        where: { sellerId: userId },
        select: { images: true, videoUrl: true, thumbnailUrl: true },
      }),
      prisma.post.findMany({
        where: { authorId: userId },
        select: { image: true, images: true, media: { select: { url: true } } },
      }),
      prisma.story.findMany({
        where: { userId },
        select: { thumbnail: true, mediaUrl: true },
      }),
      prisma.message.findMany({
        where: {
          senderId: userId,
          OR: [
            { imageUrl: { not: null } },
            { videoUrl: { not: null } },
            { audioUrl: { not: null } },
          ],
        },
        select: { imageUrl: true, videoUrl: true, audioUrl: true },
      }),
      prisma.accountVerificationRequest.findUnique({
        where: { userId },
        select: { documents: { select: { fileUrl: true } } },
      }),
    ]);

  const urls: Array<string | null | undefined> = [
    user?.avatar,
    user?.coverImage,
    ...listings.flatMap((l) => [
      ...(l.images ?? []),
      l.videoUrl,
      l.thumbnailUrl,
    ]),
    ...posts.flatMap((p) => [
      p.image,
      ...(p.images ?? []),
      ...p.media.map((m) => m.url),
    ]),
    ...stories.flatMap((st) => [st.thumbnail, st.mediaUrl]),
    // Chat media only when it is provably this user's upload (per-user chat
    // folder): a shared / forwarded URL may be another person's file.
    ...messages
      .flatMap((m) => [m.imageUrl, m.videoUrl, m.audioUrl])
      .filter((u) => isOwnChatUpload(u, userId)),
    ...(verification?.documents ?? []).map((d) => d.fileUrl),
  ];
  return [
    ...new Set(
      urls.filter(
        (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
      ),
    ),
  ];
}

/**
 * Operations for one `$transaction([...])` that deletes an account:
 * - anonymizes the User row (see `anonymizedUserData`);
 * - revokes every refresh session and push device token;
 * - removes identity documents / national id (verification request cascades
 *   to its documents + timeline);
 * - wipes the content of the user's listings (title, description, photos,
 *   video, location, contact phones) and hides them; the rows stay because
 *   listing fees / payments / boosts point at them;
 * - wipes + hides posts (media rows removed), deletes stories;
 * - replaces the text of the user's comments and sent messages with a
 *   placeholder and drops message media (other people's threads and reply
 *   chains stay intact); anonymizes live-stream comments;
 * - clears ip / user agent on consent records (the consent itself is kept);
 * - queues every stored media file for deletion (MediaDeletionJob).
 * Payments, listing fees, commissions and subscriptions are kept untouched;
 * they now point at an anonymous row.
 */
export function accountDeletionOperations(
  prisma: DeletionClient,
  userId: string,
  mediaUrls: string[] = [],
): Prisma.PrismaPromise<unknown>[] {
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.userDeviceToken.deleteMany({ where: { userId } }),
    prisma.accountVerificationRequest.deleteMany({ where: { userId } }),
    // Hide listings that were still live (keeps an earlier deletedAt as is).
    prisma.listing.updateMany({
      where: { sellerId: userId, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.listing.updateMany({
      where: { sellerId: userId },
      data: {
        displayPhone: null,
        contactPhone: null,
        displayUsername: null,
        displaySellerName: null,
        displayRegion: null,
        title: DELETED_LISTING_TITLE_EN,
        arabicTitle: DELETED_LISTING_TITLE_AR,
        description: '',
        arabicDescription: '',
        breed: null,
        age: null,
        location: '',
        arabicLocation: '',
        images: [],
        videoUrl: null,
        thumbnailUrl: null,
        videoDuration: null,
        videoWidth: null,
        videoHeight: null,
        videoFileSize: null,
        lat: null,
        lng: null,
        cityId: null,
        geoSource: null,
      },
    }),
    prisma.postMedia.deleteMany({ where: { post: { authorId: userId } } }),
    prisma.post.updateMany({
      where: { authorId: userId, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.post.updateMany({
      where: { authorId: userId },
      data: {
        content: '',
        arabicContent: '',
        image: null,
        images: [],
        isHidden: true,
      },
    }),
    prisma.story.deleteMany({ where: { userId } }),
    prisma.postComment.updateMany({
      where: { authorId: userId },
      data: { content: DELETED_CONTENT_AR },
    }),
    prisma.listingComment.updateMany({
      where: { authorId: userId },
      data: { content: DELETED_CONTENT_AR },
    }),
    prisma.message.updateMany({
      where: { senderId: userId },
      data: {
        text: DELETED_CONTENT_AR,
        type: 'TEXT',
        imageUrl: null,
        videoUrl: null,
        audioUrl: null,
        mediaDurationMs: null,
        mediaMimeType: null,
        mediaSizeBytes: null,
      },
    }),
    prisma.liveComment.updateMany({
      where: { userId },
      data: {
        username: DELETED_ACCOUNT_NAME_EN,
        arabicName: DELETED_ACCOUNT_NAME_AR,
        avatar: null,
        message: DELETED_CONTENT_AR,
      },
    }),
    prisma.consentRecord.updateMany({
      where: { userId },
      data: { ip: null, userAgent: null },
    }),
  ];
  if (mediaUrls.length) {
    ops.push(
      prisma.mediaDeletionJob.createMany({
        data: mediaUrls.map((url) => ({
          url,
          reason: 'account_deletion',
          userId,
        })),
      }),
    );
  }
  ops.push(
    prisma.user.update({
      where: { id: userId },
      data: anonymizedUserData(userId),
    }),
  );
  return ops;
}
