import { ButcherApplicationNotificationsService } from '../../services/butcher-application-notifications.service';
import { AppNotificationsService } from '../../../queue/services/app-notifications.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { TEST_APP_ID, TEST_USER_ID } from '../helpers/testUtils';

const app = {
  id: TEST_APP_ID,
  applicationNumber: 7,
  status: 'SUBMITTED' as const,
  nameAr: 'ملحمة',
  nameEn: 'Butcher',
  country: 'SA' as const,
  city: null,
  submittedAt: new Date(),
  approvedAt: null,
  rejectedAt: null,
  withdrawnAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  provisionedButcherId: null,
  shopPhone: null,
  commercialReg: null,
  cityAr: null,
  address: null,
  addressAr: null,
  lat: null,
  lng: null,
  bioAr: null,
  bioEn: null,
  specialties: [],
  openTime: '08:00',
  closeTime: '22:00',
  rejectionReason: null,
  acceptedTermsAt: null,
  documents: [],
  timeline: [],
};

describe('ButcherApplicationNotificationsService', () => {
  const notifications = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  } as unknown as AppNotificationsService;

  const applications = {
    findAllAdminUserIds: jest.fn().mockResolvedValue(['admin-1', 'admin-2']),
  } as unknown as ApplicationRepository;

  const service = new ButcherApplicationNotificationsService(
    notifications,
    applications,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifyApplicationSubmitted fans out to admins', async () => {
    await service.notifyApplicationSubmitted(app as never, TEST_USER_ID);

    expect(applications.findAllAdminUserIds).toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['admin-1', 'admin-2'],
      expect.objectContaining({
        type: 'system',
        data: expect.objectContaining({
          event: 'butcher_application_submitted',
          applicationId: TEST_APP_ID,
          applicationNumber: 7,
          userId: TEST_USER_ID,
        }),
      }),
    );
  });

  it('notifyAfterApplicationSubmit notifies admins and applicant', async () => {
    await service.notifyAfterApplicationSubmit(app as never, TEST_USER_ID);
    expect(notifications.notifyUsers).toHaveBeenCalled();
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        data: expect.objectContaining({
          event: 'butcher_application_received',
        }),
      }),
    );
  });
});
