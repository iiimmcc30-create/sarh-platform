import { Prisma } from '@prisma/client';
import { UsersRepository } from '../repositories/users.repository';
import {
  accountDeletionOperations,
  anonymizedUserData,
  collectAccountMediaUrls,
  DELETED_CONTENT_AR,
  DELETED_ACCOUNT_NAME_AR,
  deletedUsername,
} from './account-anonymization';

const USER_ID = '3f2b6c1e-9a4d-4e3b-8f1a-0c2d3e4f5a6b';

function prismaMock() {
  const op = (name: string) => jest.fn((args: unknown) => ({ op: name, args }));
  return {
    user: {
      update: op('user.update'),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userSession: { deleteMany: op('userSession.deleteMany') },
    userDeviceToken: { deleteMany: op('userDeviceToken.deleteMany') },
    accountVerificationRequest: {
      deleteMany: op('accountVerificationRequest.deleteMany'),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    listing: {
      updateMany: op('listing.updateMany'),
      findMany: jest.fn().mockResolvedValue([]),
    },
    post: {
      updateMany: op('post.updateMany'),
      findMany: jest.fn().mockResolvedValue([]),
    },
    postMedia: { deleteMany: op('postMedia.deleteMany') },
    postComment: { updateMany: op('postComment.updateMany') },
    listingComment: { updateMany: op('listingComment.updateMany') },
    story: {
      deleteMany: op('story.deleteMany'),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      updateMany: op('message.updateMany'),
      findMany: jest.fn().mockResolvedValue([]),
    },
    liveComment: { updateMany: op('liveComment.updateMany') },
    consentRecord: { updateMany: op('consentRecord.updateMany') },
    mediaDeletionJob: { createMany: op('mediaDeletionJob.createMany') },
    payment: {
      update: op('payment.update'),
      deleteMany: op('payment.deleteMany'),
    },
    listingFee: { deleteMany: op('listingFee.deleteMany') },
    subscription: { delete: op('subscription.delete') },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
}

describe('account deletion anonymization', () => {
  it('nulls / tombstones every personal field on the User row', () => {
    const data = anonymizedUserData(USER_ID) as Record<string, unknown>;
    for (const key of [
      'email',
      'phone',
      'googleId',
      'avatar',
      'coverImage',
      'bio',
      'about',
      'website',
      'publicPhone',
      'publicEmail',
      'birthDate',
      'fcmToken',
      'lastSeenAt',
      'verifiedTier',
    ]) {
      expect(data[key]).toBeNull();
    }
    expect(data.profileLinks).toBe(Prisma.DbNull);
    expect(data.notificationPrefs).toBe(Prisma.DbNull);
    expect(data.arabicName).toBe(DELETED_ACCOUNT_NAME_AR);
    expect(data.displayName).toBe('Deleted account');
    expect(data.isActive).toBe(false);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.verified).toBe(false);
    expect(data.showInSearch).toBe(false);
    expect(data.allowPrivateMessages).toBe(false);
  });

  it('frees the username with a unique id-based tombstone', () => {
    const data = anonymizedUserData(USER_ID);
    expect(data.username).toBe(deletedUsername(USER_ID));
    expect(deletedUsername(USER_ID)).toBe(
      'deleted_3f2b6c1e9a4d4e3b8f1a0c2d3e4f5a6b',
    );
    expect(deletedUsername('other-id')).not.toBe(deletedUsername(USER_ID));
  });

  it('kills passwords and every issued access token', () => {
    const a = anonymizedUserData(USER_ID);
    const b = anonymizedUserData(USER_ID);
    expect(a.passwordHash).toMatch(/^!deleted:[0-9a-f]{48}$/);
    expect(a.passwordHash).not.toBe(b.passwordHash);
    expect(String(a.passwordHash).startsWith('$2')).toBe(false); // never a bcrypt hash
    expect(a.passwordVersion).toEqual({ increment: 1 });
  });

  it('revokes sessions + device tokens, drops ID documents, wipes content, anonymizes the user last', () => {
    const prisma = prismaMock();
    const ops = accountDeletionOperations(
      prisma as never,
      USER_ID,
    ) as unknown as Array<{
      op: string;
      args: Record<string, unknown>;
    }>;
    expect(ops.map((o) => o.op)).toEqual([
      'userSession.deleteMany',
      'userDeviceToken.deleteMany',
      'accountVerificationRequest.deleteMany',
      'listing.updateMany',
      'listing.updateMany',
      'postMedia.deleteMany',
      'post.updateMany',
      'post.updateMany',
      'story.deleteMany',
      'postComment.updateMany',
      'listingComment.updateMany',
      'message.updateMany',
      'liveComment.updateMany',
      'consentRecord.updateMany',
      'user.update',
    ]);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.accountVerificationRequest.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    // Listings: hidden (only the live ones get a new deletedAt) and wiped.
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { sellerId: USER_ID, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { sellerId: USER_ID },
      data: expect.objectContaining({
        displayPhone: null,
        contactPhone: null,
        description: '',
        arabicDescription: '',
        images: [],
        videoUrl: null,
        thumbnailUrl: null,
        lat: null,
        lng: null,
        location: '',
      }),
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { authorId: USER_ID },
      data: expect.objectContaining({ content: '', images: [], image: null }),
    });
    expect(prisma.story.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.postComment.updateMany).toHaveBeenCalledWith({
      where: { authorId: USER_ID },
      data: { content: DELETED_CONTENT_AR },
    });
    expect(prisma.listingComment.updateMany).toHaveBeenCalledWith({
      where: { authorId: USER_ID },
      data: { content: DELETED_CONTENT_AR },
    });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { senderId: USER_ID },
      data: expect.objectContaining({
        text: DELETED_CONTENT_AR,
        imageUrl: null,
        videoUrl: null,
        audioUrl: null,
      }),
    });
    expect(prisma.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { ip: null, userAgent: null },
    });
    expect(prisma.mediaDeletionJob.createMany).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: expect.objectContaining({
        phone: null,
        email: null,
        isActive: false,
      }),
    });
  });

  it('queues the collected media for deletion inside the same transaction', () => {
    const prisma = prismaMock();
    const ops = accountDeletionOperations(prisma as never, USER_ID, [
      'https://res.cloudinary.com/c/image/upload/v1/sarh/listings/a.jpg',
    ]) as unknown as Array<{ op: string }>;
    expect(ops.map((o) => o.op)).toContain('mediaDeletionJob.createMany');
    expect(ops[ops.length - 1].op).toBe('user.update');
    expect(prisma.mediaDeletionJob.createMany).toHaveBeenCalledWith({
      data: [
        {
          url: 'https://res.cloudinary.com/c/image/upload/v1/sarh/listings/a.jpg',
          reason: 'account_deletion',
          userId: USER_ID,
        },
      ],
    });
  });

  it('collects avatar, listing, post, story, ID-document and own chat media (not shared chat URLs)', async () => {
    const prisma = prismaMock();
    const base = process.env.CLOUDINARY_FOLDER || 'safat';
    const cld = (p: string) =>
      `https://res.cloudinary.com/c/image/upload/v1/${base}/${p}.jpg`;
    prisma.user.findUnique.mockResolvedValue({
      avatar: cld('avatars/me'),
      coverImage: null,
    });
    prisma.listing.findMany.mockResolvedValue([
      {
        images: [cld('listings/l1'), cld('listings/l1')],
        videoUrl: null,
        thumbnailUrl: null,
      },
    ]);
    prisma.post.findMany.mockResolvedValue([
      { image: null, images: [], media: [{ url: cld('posts/p1') }] },
    ]);
    prisma.story.findMany.mockResolvedValue([
      { thumbnail: cld('stories/s1'), mediaUrl: null },
    ]);
    prisma.message.findMany.mockResolvedValue([
      {
        imageUrl: cld(`messages/${USER_ID}/m1`),
        videoUrl: null,
        audioUrl: null,
      },
      // someone else's listing photo shared in chat — never deleted
      { imageUrl: cld('listings/other'), videoUrl: null, audioUrl: null },
    ]);
    prisma.accountVerificationRequest.findUnique.mockResolvedValue({
      documents: [{ fileUrl: cld(`support/${USER_ID}/id-front`) }],
    });

    const urls = await collectAccountMediaUrls(prisma as never, USER_ID);

    expect(urls).toEqual([
      cld('avatars/me'),
      cld('listings/l1'),
      cld('posts/p1'),
      cld('stories/s1'),
      cld(`messages/${USER_ID}/m1`),
      cld(`support/${USER_ID}/id-front`),
    ]);
  });

  it('keeps payments, listing fees and subscriptions for accounting', () => {
    const prisma = prismaMock();
    void accountDeletionOperations(prisma as never, USER_ID);
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.payment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.listingFee.deleteMany).not.toHaveBeenCalled();
    expect(prisma.subscription.delete).not.toHaveBeenCalled();
  });

  it('UsersRepository.deactivateUser runs the whole set in one transaction', async () => {
    const prisma = prismaMock();
    const repo = new UsersRepository(prisma as never);
    await repo.deactivateUser(USER_ID);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{ op: string }>;
    expect(ops).toHaveLength(15);
    expect(ops[ops.length - 1].op).toBe('user.update');
  });
});
