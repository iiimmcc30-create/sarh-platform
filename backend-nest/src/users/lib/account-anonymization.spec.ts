import { Prisma } from '@prisma/client';
import { UsersRepository } from '../repositories/users.repository';
import {
  accountDeletionOperations,
  anonymizedUserData,
  DELETED_ACCOUNT_NAME_AR,
  deletedUsername,
} from './account-anonymization';

const USER_ID = '3f2b6c1e-9a4d-4e3b-8f1a-0c2d3e4f5a6b';

function prismaMock() {
  const op = (name: string) => jest.fn((args: unknown) => ({ op: name, args }));
  return {
    user: { update: op('user.update') },
    userSession: { deleteMany: op('userSession.deleteMany') },
    userDeviceToken: { deleteMany: op('userDeviceToken.deleteMany') },
    accountVerificationRequest: {
      deleteMany: op('accountVerificationRequest.deleteMany'),
    },
    listing: { updateMany: op('listing.updateMany') },
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

  it('revokes sessions + device tokens, drops ID documents, scrubs listing phones', () => {
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
      'user.update',
    ]);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.userDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.accountVerificationRequest.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { sellerId: USER_ID },
      data: { displayPhone: null, contactPhone: null },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: expect.objectContaining({
        phone: null,
        email: null,
        isActive: false,
      }),
    });
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
    expect(ops).toHaveLength(5);
    expect(ops[4].op).toBe('user.update');
  });
});
