import { UsersService } from './users.service';
import { ApiException } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PROFILE_CHANGE_ERRORS } from '../lib/profile-change-cooldown';

describe('UsersService profile identity cooldowns', () => {
  const repo = {
    updateUser: jest.fn(),
    updateUserLocked: jest.fn(),
    upsertDeviceToken: jest.fn(),
    deleteDeviceToken: jest.fn(),
    findUserById: jest.fn(),
    findByUsername: jest.fn(),
    findUserByEmail: jest.fn(),
    findUserChangeState: jest.fn(),
    findPrivacySettings: jest.fn(),
  };
  const redis = {
    cacheDel: jest.fn(),
    cacheGet: jest.fn(),
    cacheSet: jest.fn(),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const service = new UsersService(
    repo as never,
    redis as never,
    logger as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const self: JwtPayload = {
    userId: 'u1',
    username: 'ahmed',
    role: 'USER',
    passwordVersion: 0,
  };

  const current = {
    username: 'ahmed',
    displayName: 'أحمد',
    arabicName: 'أحمد',
    nameChangedAt: null as Date | null,
    usernameChangedAt: null as Date | null,
  };

  const updatedRow = {
    id: 'u1',
    username: 'ahmed',
    displayName: 'أحمد',
    arabicName: 'أحمد',
    avatar: null,
    coverImage: null,
    bio: null,
    verified: false,
    country: 'SA',
    rating: 0,
    reviewCount: 0,
    showInSearch: true,
    allowPrivateMessages: true,
    showFollowingList: true,
    commentsAudience: 'everyone',
    privateMessagesAudience: 'everyone',
    notificationsEnabled: true,
    email: null,
    birthDate: null,
    nameChangedAt: null as Date | null,
    usernameChangedAt: null as Date | null,
    _count: { followers: 0, following: 0 },
  };

  function mockLock(state = current) {
    repo.updateUserLocked.mockImplementation(
      async (
        _id: string,
        apply: (
          row: typeof current,
          tx: { user: { findFirst: typeof repo.findByUsername } },
        ) => Promise<Record<string, unknown>>,
      ) => {
        const data = await apply(state, {
          user: { findFirst: repo.findByUsername },
        });
        return {
          ...updatedRow,
          ...data,
          nameChangedAt:
            (data.nameChangedAt as Date | undefined) ?? state.nameChangedAt,
          usernameChangedAt:
            (data.usernameChangedAt as Date | undefined) ??
            state.usernameChangedAt,
          displayName:
            (data.displayName as string | undefined) ?? state.displayName,
          arabicName:
            (data.arabicName as string | undefined) ?? state.arabicName,
          username: (data.username as string | undefined) ?? state.username,
        };
      },
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ toFake: ['Date'] });
    jest.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
    repo.findByUsername.mockResolvedValue(null);
    mockLock();
    repo.updateUser.mockResolvedValue(updatedRow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('succeeds on the first name change and stamps nameChangedAt', async () => {
    const result = await service.updateUser('u1', self, {
      displayName: 'سالم',
      arabicName: 'سالم',
    });
    expect(result.displayName).toBe('سالم');
    expect(result.nameChangedAt).toBeTruthy();
    expect(result.nameNextAllowedAt).toBeTruthy();
    expect(repo.updateUserLocked).toHaveBeenCalled();
    const data = await repo.updateUserLocked.mock.calls[0][1](current, {
      user: { findFirst: repo.findByUsername },
    });
    expect(data.nameChangedAt).toBeInstanceOf(Date);
  });

  it('does not stamp nameChangedAt when saving the same name', async () => {
    const stamped = {
      ...current,
      nameChangedAt: new Date('2026-09-20T00:00:00.000Z'),
    };
    mockLock(stamped);
    await service.updateUser('u1', self, {
      displayName: 'أحمد',
      arabicName: 'أحمد',
    });
    const data = await repo.updateUserLocked.mock.calls[0][1](stamped, {
      user: { findFirst: repo.findByUsername },
    });
    expect(data.nameChangedAt).toBeUndefined();
    expect(data.displayName).toBeUndefined();
  });

  it('rejects a second name change before 7 days with nextAllowedAt', async () => {
    const stamped = {
      ...current,
      nameChangedAt: new Date('2026-09-22T00:00:00.000Z'),
    };
    mockLock(stamped);
    expect.assertions(3);
    try {
      await service.updateUser('u1', self, {
        displayName: 'سالم',
        arabicName: 'سالم',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const api = err as ApiException;
      expect(api.error).toBe(PROFILE_CHANGE_ERRORS.NAME_COOLDOWN);
      expect((api.details as { nextAllowedAt: string }).nextAllowedAt).toBe(
        '2026-09-29T00:00:00.000Z',
      );
    }
  });

  it('allows a name change after 7 days', async () => {
    const stamped = {
      ...current,
      nameChangedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    };
    mockLock(stamped);
    const result = await service.updateUser('u1', self, {
      displayName: 'سالم',
      arabicName: 'سالم',
    });
    expect(result.displayName).toBe('سالم');
    expect(result.nameChangedAt).toBeTruthy();
  });

  it('allows a duplicate display name belonging to another user', async () => {
    await service.updateUser('u1', self, {
      displayName: 'محمد',
      arabicName: 'محمد',
    });
    expect(repo.findByUsername).not.toHaveBeenCalled();
    expect(repo.updateUserLocked).toHaveBeenCalled();
  });

  it('succeeds on the first username change', async () => {
    const result = await service.updateUser('u1', self, { username: 'salem' });
    expect(result.username).toBe('salem');
    expect(result.usernameChangedAt).toBeTruthy();
    expect(result.usernameNextAllowedAt).toBeTruthy();
  });

  it('does not stamp usernameChangedAt when saving the same username', async () => {
    const stamped = {
      ...current,
      usernameChangedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    mockLock(stamped);
    await service.updateUser('u1', self, { username: 'ahmed' });
    const data = await repo.updateUserLocked.mock.calls[0][1](stamped, {
      user: { findFirst: repo.findByUsername },
    });
    expect(data.usernameChangedAt).toBeUndefined();
    expect(data.username).toBeUndefined();
  });

  it('rejects a second username change before 30 days with nextAllowedAt', async () => {
    const stamped = {
      ...current,
      usernameChangedAt: new Date('2026-09-22T00:00:00.000Z'),
    };
    mockLock(stamped);
    expect.assertions(3);
    try {
      await service.updateUser('u1', self, { username: 'salem' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const api = err as ApiException;
      expect(api.error).toBe(PROFILE_CHANGE_ERRORS.USERNAME_COOLDOWN);
      expect((api.details as { nextAllowedAt: string }).nextAllowedAt).toBe(
        '2026-10-22T00:00:00.000Z',
      );
    }
  });

  it('allows a username change after 30 days', async () => {
    const stamped = {
      ...current,
      usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    };
    mockLock(stamped);
    const result = await service.updateUser('u1', self, { username: 'salem' });
    expect(result.username).toBe('salem');
  });

  it('rejects a username that belongs to another account', async () => {
    repo.findByUsername.mockResolvedValue({ id: 'u2' });
    await expect(
      service.updateUser('u1', self, { username: 'taken' }),
    ).rejects.toMatchObject({
      status: 409,
      error: PROFILE_CHANGE_ERRORS.USERNAME_TAKEN,
      messageAr: 'اسم المستخدم محجوز',
    });
  });

  it('maps a unique-constraint race to username_taken without a second write', async () => {
    repo.updateUserLocked.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(
      service.updateUser('u1', self, { username: 'salem' }),
    ).rejects.toMatchObject({
      status: 409,
      error: PROFILE_CHANGE_ERRORS.USERNAME_TAKEN,
    });
    expect(repo.updateUserLocked).toHaveBeenCalledTimes(1);
    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('does not persist a timestamp when the update fails', async () => {
    repo.updateUserLocked.mockRejectedValue(new Error('db down'));
    await expect(
      service.updateUser('u1', self, {
        displayName: 'سالم',
        arabicName: 'سالم',
      }),
    ).rejects.toThrow('db down');
    expect(repo.updateUserLocked).toHaveBeenCalledTimes(1);
    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('keeps bio updates on the unlocked path', async () => {
    await service.updateUser('u1', self, { bio: 'hello' });
    expect(repo.updateUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ bio: 'hello' }),
    );
    expect(repo.updateUserLocked).not.toHaveBeenCalled();
  });

  it('reports username availability without treating the current user as a conflict', async () => {
    repo.findByUsername.mockResolvedValueOnce(null);
    await expect(service.isUsernameAvailable('salem', 'u1')).resolves.toEqual({
      available: true,
    });
    expect(repo.findByUsername).toHaveBeenCalledWith('salem', 'u1');

    repo.findByUsername.mockResolvedValueOnce({ id: 'u2' });
    await expect(service.isUsernameAvailable('taken', 'u1')).resolves.toEqual({
      available: false,
    });
  });
});
