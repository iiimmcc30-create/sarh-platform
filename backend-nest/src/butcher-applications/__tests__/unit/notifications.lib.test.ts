import { AppNotificationsService } from '../../../queue/services/app-notifications.service';
import { NotificationQueueService } from '../../../queue/services/notification-queue.service';
import { LoggerService } from '../../../common/services/logger.service';

describe('AppNotificationsService', () => {
  const queue = {
    addNotification: jest.fn().mockResolvedValue({ id: 'job-1' }),
  } as unknown as NotificationQueueService;

  const logger = {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  } as unknown as LoggerService;

  const service = new AppNotificationsService(queue, logger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stringifyNotificationData', () => {
    it('stringifies values and omits nullish', () => {
      expect(
        service.stringifyNotificationData({
          event: 'butcher_application_received',
          applicationNumber: 12,
          skipped: null,
          missing: undefined,
        }),
      ).toEqual({
        event: 'butcher_application_received',
        applicationNumber: '12',
      });
    });
  });

  describe('notifyUser', () => {
    it('delegates to queue with system type', async () => {
      await service.notifyUser({
        userId: 'user-1',
        type: 'system',
        titleAr: 'عنوان',
        bodyAr: 'نص',
        data: { event: 'butcher_application_received', applicationId: 'app-1' },
      });

      expect(queue.addNotification).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'system',
        titleAr: 'عنوان',
        bodyAr: 'نص',
        data: {
          event: 'butcher_application_received',
          applicationId: 'app-1',
        },
      });
    });

    it('swallows queue errors', async () => {
      (queue.addNotification as jest.Mock).mockRejectedValueOnce(
        new Error('redis down'),
      );
      await expect(
        service.notifyUser({
          userId: 'user-1',
          type: 'system',
          titleAr: 't',
          bodyAr: 'b',
        }),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('notifyUsers', () => {
    it('uses Promise.allSettled for fan-out', async () => {
      const spy = jest.spyOn(Promise, 'allSettled');
      await service.notifyUsers(['a', 'b'], {
        type: 'system',
        titleAr: 't',
        bodyAr: 'b',
        data: { event: 'butcher_application_submitted' },
      });
      expect(spy).toHaveBeenCalled();
      expect(queue.addNotification).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });
  });
});
