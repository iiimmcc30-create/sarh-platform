import { NotificationPersistService } from './notification-persist.service';

describe('NotificationPersistService multi-device enqueue', () => {
  const notifications = {
    findUserPushTargets: jest.fn(),
    createNotification: jest.fn(),
  };
  const pushQueue = { addPush: jest.fn() };
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

  const service = new NotificationPersistService(
    notifications as never,
    pushQueue as never,
    logger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues a push job per device token', async () => {
    notifications.findUserPushTargets.mockResolvedValue({
      fcmToken: 'tok-a',
      notificationsEnabled: true,
      deviceTokens: [{ token: 'tok-a' }, { token: 'tok-b' }],
    });

    await service.enqueuePushAfterPersist({
      userId: 'u1',
      notificationId: 'n1',
      type: 'system',
      titleAr: 'عنوان',
      bodyAr: 'نص',
      data: { type: 'system' },
    });

    expect(pushQueue.addPush).toHaveBeenCalledTimes(2);
    expect(pushQueue.addPush).toHaveBeenCalledWith(
      expect.objectContaining({ fcmToken: 'tok-a' }),
    );
    expect(pushQueue.addPush).toHaveBeenCalledWith(
      expect.objectContaining({ fcmToken: 'tok-b' }),
    );
  });

  const job = {
    userId: 'u1',
    type: 'like',
    titleAr: 'إعجاب',
    bodyAr: 'أعجب بمنشورك',
    data: { postId: 'p1' },
  };

  it('reuses the same row id on processor retry (same queue job)', async () => {
    notifications.createNotification
      .mockResolvedValueOnce({ id: 'row' })
      .mockRejectedValueOnce({ code: 'P2002' });
    notifications.findUserPushTargets.mockResolvedValue({
      fcmToken: 'tok-a',
      notificationsEnabled: true,
      deviceTokens: [{ token: 'tok-a' }],
    });

    const first = await service.persistNotificationAndEnqueuePush(
      job,
      'bull-1',
    );
    const second = await service.persistNotificationAndEnqueuePush(
      job,
      'bull-1',
    );

    expect(first).toBe(second);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification.mock.calls[0][0].id).toBe(first);
    expect(notifications.createNotification.mock.calls[1][0].id).toBe(first);
    expect(pushQueue.addPush).toHaveBeenCalledTimes(1);
  });

  it('does not merge different notifications / different jobs', async () => {
    notifications.createNotification.mockResolvedValue({ id: 'row' });
    notifications.findUserPushTargets.mockResolvedValue({
      fcmToken: null,
      notificationsEnabled: true,
      deviceTokens: [],
    });

    const likeId = await service.persistNotificationAndEnqueuePush(
      job,
      'job-like',
    );
    const commentId = await service.persistNotificationAndEnqueuePush(
      { ...job, type: 'comment', data: { postId: 'p1', commentId: 'c1' } },
      'job-comment',
    );

    expect(likeId).not.toBe(commentId);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });

  it('creates a row once when there is no duplicate', async () => {
    notifications.createNotification.mockResolvedValue({ id: 'n' });
    notifications.findUserPushTargets.mockResolvedValue({
      fcmToken: null,
      notificationsEnabled: true,
      deviceTokens: [],
    });

    const id = await service.persistNotificationAndEnqueuePush(job);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });
});
