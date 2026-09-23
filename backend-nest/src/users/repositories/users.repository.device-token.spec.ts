import { UsersRepository } from './users.repository';

describe('UsersRepository device tokens', () => {
  const prisma = {
    userDeviceToken: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    user: { update: jest.fn(), findUnique: jest.fn() },
    userSession: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const repo = new UsersRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts the same token without creating a second unique key', async () => {
    prisma.userDeviceToken.upsert.mockResolvedValue({
      id: 'd1',
      token: 'tok-a',
    });
    await repo.upsertDeviceToken('u1', 'tok-a', 'ios');
    await repo.upsertDeviceToken('u1', 'tok-a', 'ios');
    expect(prisma.userDeviceToken.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.userDeviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'tok-a' },
        create: expect.objectContaining({ userId: 'u1', token: 'tok-a' }),
        update: expect.objectContaining({ userId: 'u1' }),
      }),
    );
  });

  it('deletes only the matching user token on logout', async () => {
    prisma.userDeviceToken.deleteMany.mockResolvedValue({ count: 1 });
    await repo.deleteDeviceToken('u1', 'tok-a');
    expect(prisma.userDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', token: 'tok-a' },
    });
  });

  it('registers device A and device B as separate upsert keys', async () => {
    prisma.userDeviceToken.upsert.mockResolvedValue({});
    await repo.upsertDeviceToken('u1', 'tok-a', 'android');
    await repo.upsertDeviceToken('u1', 'tok-b', 'ios');
    expect(prisma.userDeviceToken.upsert.mock.calls[0][0].where).toEqual({
      token: 'tok-a',
    });
    expect(prisma.userDeviceToken.upsert.mock.calls[1][0].where).toEqual({
      token: 'tok-b',
    });
  });
});
