import { UserSettingsService } from './user-settings.service';

describe('UserSettingsService sessions («الأجهزة المتصلة»)', () => {
  const userSession = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prisma = { userSession };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new UserSettingsService(prisma as never, {} as never, logger as never);

  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => jest.clearAllMocks());

  it('marks the caller device as current, derives lastActiveAt and never returns the token', async () => {
    const now = Date.now();
    userSession.findMany.mockResolvedValue([
      {
        id: 's1',
        deviceInfo: 'Sarh/1 CFNetwork Darwin',
        ipAddress: '10.0.0.5',
        createdAt: new Date(now - 10 * DAY),
        expiresAt: new Date(now + 29 * DAY),
        refreshToken: 'tok-current',
      },
      {
        id: 's2',
        deviceInfo: 'okhttp/4',
        ipAddress: null,
        createdAt: new Date(now - 2 * DAY),
        expiresAt: new Date(now + 20 * DAY),
        refreshToken: 'tok-other',
      },
    ]);
    const { sessions } = await service.listSessions('u1', 'tok-current');
    expect(sessions.map((s) => s.current)).toEqual([true, false]);
    expect(sessions[0].platform).toBe('ios');
    // 30-day TTL: refreshed one day ago.
    expect(Math.round((now - new Date(sessions[0].lastActiveAt).getTime()) / DAY)).toBe(1);
    // Never earlier than the sign-in itself.
    expect(new Date(sessions[1].lastActiveAt).getTime()).toBe(now - 2 * DAY);
    expect(JSON.stringify(sessions)).not.toContain('tok-');
  });

  it('without a token nothing is marked current', async () => {
    userSession.findMany.mockResolvedValue([
      { id: 's1', deviceInfo: null, ipAddress: null, createdAt: new Date(), expiresAt: new Date(Date.now() + DAY), refreshToken: 't' },
    ]);
    const { sessions } = await service.listSessions('u1');
    expect(sessions[0].current).toBe(false);
  });

  it('revokes only the caller own session', async () => {
    userSession.deleteMany.mockResolvedValue({ count: 1 });
    await service.revokeSession('u1', 's9');
    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { id: 's9', userId: 'u1' } });
    userSession.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.revokeSession('u1', 'nope')).rejects.toBeTruthy();
  });

  it('signs out the other devices and keeps this one', async () => {
    userSession.findFirst.mockResolvedValue({ id: 'keep' });
    userSession.deleteMany.mockResolvedValue({ count: 3 });
    await expect(service.revokeOtherSessions('u1', 'tok-current')).resolves.toEqual({ revoked: 3 });
    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 'keep' } } });
    userSession.findFirst.mockResolvedValue(null);
    await expect(service.revokeOtherSessions('u1', 'unknown-token')).rejects.toBeTruthy();
  });
});
