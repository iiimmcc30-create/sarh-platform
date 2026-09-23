import { UsersService } from './users.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

describe('UsersService FCM device-token lifecycle', () => {
  const repo = {
    updateUser: jest.fn(),
    upsertDeviceToken: jest.fn(),
    deleteDeviceToken: jest.fn(),
    findUserById: jest.fn(),
  };
  const redis = { cacheDel: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const socketDisconnect = {};
  const notifications = {};
  const config = {};

  const service = new UsersService(
    repo as never,
    redis as never,
    logger as never,
    socketDisconnect as never,
    notifications as never,
    config as never,
  );

  const self: JwtPayload = {
    userId: 'u1',
    username: 'u',
    role: 'USER',
    passwordVersion: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.updateUser.mockResolvedValue({
      id: 'u1',
      username: 'u',
      displayName: 'd',
      arabicName: 'a',
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
      _count: { followers: 0, following: 0 },
    });
  });

  it('upserts a device token without dropping other devices', async () => {
    await service.updateUser('u1', self, {
      fcmToken: 'tok-b',
      fcmPlatform: 'ios',
    });
    expect(repo.upsertDeviceToken).toHaveBeenCalledWith('u1', 'tok-b', 'ios');
    expect(repo.deleteDeviceToken).not.toHaveBeenCalled();
  });

  it('unregisters only the given token and clears legacy column when it matches', async () => {
    repo.findUserById.mockResolvedValue({ fcmToken: 'tok-a' });
    await service.updateUser('u1', self, {
      fcmToken: 'tok-a',
      unregisterFcm: true,
    });
    expect(repo.deleteDeviceToken).toHaveBeenCalledWith('u1', 'tok-a');
    expect(repo.upsertDeviceToken).not.toHaveBeenCalled();
    expect(repo.updateUser).toHaveBeenCalledWith('u1', { fcmToken: null });
  });

  it('does not clear legacy fcmToken when unregistering a different device', async () => {
    repo.findUserById.mockResolvedValue({ fcmToken: 'tok-legacy' });
    await service.updateUser('u1', self, {
      fcmToken: 'tok-b',
      unregisterFcm: true,
    });
    expect(repo.deleteDeviceToken).toHaveBeenCalledWith('u1', 'tok-b');
    expect(repo.updateUser).not.toHaveBeenCalledWith('u1', { fcmToken: null });
  });
});
