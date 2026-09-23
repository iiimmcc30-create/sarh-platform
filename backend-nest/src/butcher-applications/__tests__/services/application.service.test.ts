import { ButcherApplicationUserService } from '../../services/application.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { TransactionService } from '../../services/transaction.service';
import { ButcherApplicationNotificationsService } from '../../services/butcher-application-notifications.service';
import { LoggerService } from '../../../common/services/logger.service';
import { TEST_APP_ID, TEST_USER_ID } from '../helpers/testUtils';

jest.mock('../../helpers/timeline', () => ({
  appendTimelineEvent: jest.fn().mockResolvedValue({
    id: 'event-1',
    action: 'CREATE',
    comment: null,
    createdBy: 'user',
    metadata: {},
    createdAt: new Date(),
    actor: { id: 'user', username: 'user' },
  }),
}));

jest.mock('../../helpers/transaction', () => ({
  assertUserHasNoButcher: jest.fn().mockResolvedValue(undefined),
  assertApplicationOwner: jest.fn(),
  assertNotModified: jest.fn(),
}));

const mockApplication = {
  id: TEST_APP_ID,
  userId: TEST_USER_ID,
  applicationNumber: 1,
  status: 'DRAFT' as const,
  nameAr: 'ملحمة',
  nameEn: 'Shop',
  shopPhone: '+966501234567',
  commercialReg: 'CR-12345',
  country: 'SA' as const,
  city: 'Riyadh',
  cityAr: 'الرياض',
  address: 'Street 1',
  addressAr: 'شارع ١',
  lat: 24.7,
  lng: 46.7,
  bioAr: null,
  bioEn: null,
  specialties: [],
  openTime: '08:00',
  closeTime: '22:00',
  rejectionReason: null,
  acceptedTermsAt: null,
  submittedAt: null,
  approvedAt: null,
  rejectedAt: null,
  withdrawnAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [
    { type: 'commercial_license', fileKey: 'k', status: 'UPLOADED' },
    { type: 'national_id', fileKey: 'k', status: 'UPLOADED' },
    { type: 'municipal_permit', fileKey: 'k', status: 'UPLOADED' },
    { type: 'shop_photo', fileKey: 'k', status: 'UPLOADED' },
  ],
  timelineEvents: [],
  sourcedButcher: null,
  user: { id: TEST_USER_ID, username: 'user', phone: null, avatar: null },
  accountUsername: null,
  accountEmail: null,
  accountPasswordHash: null,
};

describe('ButcherApplicationUserService', () => {
  const applications = {
    findActiveApplicationByUserAndStatus: jest.fn(),
    createApplication: jest.fn(),
    getApplicationByIdOrThrow: jest.fn(),
    updateApplicationSnapshot: jest.fn(),
    updateApplicationStatus: jest.fn(),
  } as unknown as ApplicationRepository;

  const transactions = {
    runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ butcher: { findUnique: jest.fn().mockResolvedValue(null) } }),
    ),
  } as unknown as TransactionService;

  const applicationNotifications = {
    notifyAfterApplicationSubmit: jest.fn().mockResolvedValue(undefined),
    notifyApplicationWithdrawn: jest.fn().mockResolvedValue(undefined),
  } as unknown as ButcherApplicationNotificationsService;

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as LoggerService;

  const service = new ButcherApplicationUserService(
    applications,
    transactions,
    applicationNotifications,
    logger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (transactions.runInTransaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { findFirst: jest.fn().mockResolvedValue(null) },
          butcher: { findUnique: jest.fn().mockResolvedValue(null) },
        }),
    );
  });

  describe('createDraft', () => {
    it('rejects when active draft exists', async () => {
      (
        applications.findActiveApplicationByUserAndStatus as jest.Mock
      ).mockResolvedValueOnce({ id: 'draft' });

      await expect(service.createDraft(TEST_USER_ID, {})).rejects.toMatchObject({
        code: 'ACTIVE_DRAFT_EXISTS',
      });
    });

    it('creates draft when no conflicts', async () => {
      (applications.findActiveApplicationByUserAndStatus as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (applications.createApplication as jest.Mock).mockResolvedValue(
        mockApplication,
      );

      const result = await service.createDraft(TEST_USER_ID, {
        nameAr: 'ملحمة',
      });
      expect(result.id).toBe(TEST_APP_ID);
      expect(applications.createApplication).toHaveBeenCalled();
    });
  });

  describe('updateDraft', () => {
    it('rejects non-draft via assertEditableStatus path', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
        ...mockApplication,
        status: 'SUBMITTED',
      });

      await expect(
        service.updateDraft(TEST_USER_ID, TEST_APP_ID, { nameAr: 'x' }),
      ).rejects.toMatchObject({ code: 'APPLICATION_NOT_EDITABLE' });
    });
  });

  describe('submitApplication', () => {
    it('rejects incomplete legal confirmations', async () => {
      await expect(
        service.submitApplication(TEST_USER_ID, TEST_APP_ID, {
          acceptedTerms: false as unknown as true,
          confirmAccuracy: true,
          accountUsername: 'shop_user',
          password: 'secret1',
          confirmPassword: 'secret1',
        }),
      ).rejects.toMatchObject({ code: 'APPLICATION_INCOMPLETE' });
    });

    it('submits and stores a password hash without creating a butcher', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
        mockApplication,
      );
      (applications.updateApplicationStatus as jest.Mock).mockResolvedValue({
        ...mockApplication,
        status: 'SUBMITTED',
        accountUsername: 'shop_user',
      });

      const result = await service.submitApplication(TEST_USER_ID, TEST_APP_ID, {
        acceptedTerms: true,
        confirmAccuracy: true,
        accountUsername: 'shop_user',
        password: 'secret1',
        confirmPassword: 'secret1',
      });

      expect(result.status).toBe('SUBMITTED');
      const statusPayload = (applications.updateApplicationStatus as jest.Mock)
        .mock.calls[0]?.[2];
      expect(statusPayload.accountUsername).toBe('shop_user');
      expect(statusPayload.accountPasswordHash).toMatch(/^\$2[aby]\$/);
      expect(statusPayload.accountPasswordHash).not.toContain('secret1');
      expect(
        JSON.stringify(
          (applications.updateApplicationStatus as jest.Mock).mock.calls,
        ),
      ).not.toContain('secret1');
      expect(
        applicationNotifications.notifyAfterApplicationSubmit,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: TEST_APP_ID }),
        TEST_USER_ID,
      );
    });

    it('rejects mismatched passwords before persisting', async () => {
      await expect(
        service.submitApplication(TEST_USER_ID, TEST_APP_ID, {
          acceptedTerms: true,
          confirmAccuracy: true,
          accountUsername: 'shop_user',
          password: 'secret1',
          confirmPassword: 'other99',
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PASSWORD_MISMATCH' });
      expect(applications.updateApplicationStatus).not.toHaveBeenCalled();
    });
  });

  describe('withdrawApplication', () => {
    it('withdraws submitted application and notifies', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
        ...mockApplication,
        status: 'SUBMITTED',
      });
      (applications.updateApplicationStatus as jest.Mock).mockResolvedValue({
        ...mockApplication,
        status: 'WITHDRAWN',
      });

      const result = await service.withdrawApplication(
        TEST_USER_ID,
        TEST_APP_ID,
        {},
      );
      expect(result.status).toBe('WITHDRAWN');
      expect(
        applicationNotifications.notifyApplicationWithdrawn,
      ).toHaveBeenCalled();
    });
  });
});
