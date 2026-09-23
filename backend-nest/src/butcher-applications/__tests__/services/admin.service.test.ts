import {
  ButcherApplicationAdminService,
  buildButcherCreateInput,
} from '../../services/admin.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { DocumentRepository } from '../../repositories/document.repository';
import { TransactionService } from '../../services/transaction.service';
import { ButcherApplicationNotificationsService } from '../../services/butcher-application-notifications.service';
import { LoggerService } from '../../../common/services/logger.service';
import { ButcherRankingService } from '../../../butchers/services/butcher-ranking.service';
import {
  TEST_APP_ID,
  TEST_ACCOUNT_HASH,
  TEST_BUTCHER_USER_ID,
  TEST_USER_ID,
} from '../helpers/testUtils';

jest.mock('../../helpers/timeline', () => ({
  appendTimelineEvent: jest.fn().mockResolvedValue({
    id: 'event-1',
    action: 'APPROVE',
    comment: null,
    createdBy: 'admin',
    metadata: {},
    createdAt: new Date(),
    actor: { id: 'admin', username: 'admin' },
  }),
}));

jest.mock('../../helpers/documentUrl', () => ({
  resolveAdminDocumentFileUrl: jest.fn(async (key: string | null) =>
    key ? `https://cdn.example/${key}` : null,
  ),
}));

const submittedApp = {
  id: TEST_APP_ID,
  userId: TEST_USER_ID,
  applicationNumber: 3,
  status: 'SUBMITTED' as const,
  nameAr: 'ملحمة',
  nameEn: 'Shop',
  shopPhone: '+966501234567',
  commercialReg: 'CR-1',
  country: 'SA' as const,
  city: 'Riyadh',
  cityAr: 'الرياض',
  address: 'Street',
  addressAr: 'شارع',
  lat: 24,
  lng: 46,
  bioAr: null,
  bioEn: null,
  specialties: ['sheep'],
  openTime: '08:00',
  closeTime: '22:00',
  accountUsername: 'shop_user',
  accountEmail: 'shop@example.com',
  accountPasswordHash: TEST_ACCOUNT_HASH,
  rejectionReason: null,
  acceptedTermsAt: new Date(),
  submittedAt: new Date(),
  approvedAt: null,
  rejectedAt: null,
  withdrawnAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [
    {
      id: 'doc-img',
      type: 'shop_photo',
      fileKey: 'butcher-applications/u1/photo.png',
      status: 'UPLOADED',
      notes: null,
      originalFileName: 'photo.png',
      mimeType: 'image/png',
      fileSizeBytes: 1000,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'doc-pdf',
      type: 'commercial_license',
      fileKey: 'butcher-applications/u1/license.pdf',
      status: 'UPLOADED',
      notes: null,
      originalFileName: 'license.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 2000,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  timelineEvents: [],
  sourcedButcher: null,
  user: {
    id: TEST_USER_ID,
    username: 'user',
    phone: null,
    avatar: null,
    role: 'USER',
  },
};

describe('buildButcherCreateInput', () => {
  it('maps application snapshot onto a new butcher user id', () => {
    const input = buildButcherCreateInput(
      submittedApp as never,
      TEST_BUTCHER_USER_ID,
    );
    expect(input.userId).toBe(TEST_BUTCHER_USER_ID);
    expect(input.userId).not.toBe(TEST_USER_ID);
    expect(input.nameAr).toBe('ملحمة');
    expect(input.sourceApplicationId).toBe(TEST_APP_ID);
  });
});

describe('ButcherApplicationAdminService', () => {
  const applications = {
    getApplicationByIdOrThrow: jest.fn(),
    updateApplicationStatus: jest.fn(),
    createButcher: jest.fn(),
  } as unknown as ApplicationRepository;

  const documents = {
    approveUploadedDocuments: jest.fn().mockResolvedValue(undefined),
  } as unknown as DocumentRepository;

  const txUserCreate = jest.fn().mockResolvedValue({ id: TEST_BUTCHER_USER_ID });
  const txUserFindFirst = jest.fn().mockResolvedValue(null);
  const txPlanFindUnique = jest.fn().mockResolvedValue({ id: 'plan-free-butcher' });

  const transactions = {
    runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: { findFirst: txUserFindFirst, create: txUserCreate },
        plan: { findUnique: txPlanFindUnique },
      }),
    ),
  } as unknown as TransactionService;

  const applicationNotifications = {
    notifyApplicationApproved: jest.fn().mockResolvedValue(undefined),
    notifyApplicationRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as ButcherApplicationNotificationsService;

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as LoggerService;

  const ranking = {
    onButcherCreated: jest.fn().mockResolvedValue(undefined),
  } as unknown as ButcherRankingService;

  const service = new ButcherApplicationAdminService(
    applications,
    documents,
    transactions,
    applicationNotifications,
    logger,
    ranking,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    txUserCreate.mockResolvedValue({ id: TEST_BUTCHER_USER_ID });
    txUserFindFirst.mockResolvedValue(null);
    txPlanFindUnique.mockResolvedValue({ id: 'plan-free-butcher' });
    (transactions.runInTransaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { findFirst: txUserFindFirst, create: txUserCreate },
          plan: { findUnique: txPlanFindUnique },
        }),
    );
    (documents.approveUploadedDocuments as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it('rejects approval when application is not submitted', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
      ...submittedApp,
      status: 'DRAFT',
    });

    await expect(
      service.approveApplication('admin-1', TEST_APP_ID, {}),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it('creates an independent butcher account from application credentials', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
      submittedApp,
    );
    (applications.createButcher as jest.Mock).mockResolvedValue({
      id: 'butcher-1',
      sourceApplicationId: TEST_APP_ID,
    });
    (applications.updateApplicationStatus as jest.Mock).mockResolvedValue({
      ...submittedApp,
      status: 'APPROVED',
      sourcedButcher: { id: 'butcher-1', userId: TEST_BUTCHER_USER_ID },
      user: { ...submittedApp.user, role: 'USER' },
    });

    const result = await service.approveApplication('admin-1', TEST_APP_ID, {});

    expect(txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'shop_user',
          email: 'shop@example.com',
          passwordHash: TEST_ACCOUNT_HASH,
          role: 'BUTCHER',
        }),
      }),
    );
    expect(applications.createButcher).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: TEST_BUTCHER_USER_ID,
        sourceApplicationId: TEST_APP_ID,
      }),
    );
    expect(JSON.stringify(txUserCreate.mock.calls)).not.toContain('secret1');
    expect(JSON.stringify(result)).not.toContain('accountPasswordHash');
    expect(JSON.stringify(result)).not.toContain(TEST_ACCOUNT_HASH);
    expect(result.application.user?.id).toBe(TEST_USER_ID);
    expect(result.application.user?.role).toBe('USER');
    expect(result.butcher.id).toBe('butcher-1');
    expect(result.application.documents[0]?.fileUrl).toContain(
      'butcher-applications/u1/photo.png',
    );
    expect(result.application.documents[1]?.fileUrl).toContain(
      'butcher-applications/u1/license.pdf',
    );
  });

  it('is idempotent and does not create a second butcher account', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
      ...submittedApp,
      status: 'APPROVED',
      sourcedButcher: { id: 'butcher-1', userId: TEST_BUTCHER_USER_ID },
    });

    const result = await service.approveApplication('admin-1', TEST_APP_ID, {});
    expect(result.butcher.id).toBe('butcher-1');
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(applications.createButcher).not.toHaveBeenCalled();
  });

  it('leaves the application submitted when login credentials are already taken', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
      submittedApp,
    );
    txUserFindFirst.mockResolvedValue({
      username: 'shop_user',
      email: 'shop@example.com',
      phone: null,
    });

    await expect(
      service.approveApplication('admin-1', TEST_APP_ID, {}),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CREDENTIALS_TAKEN' });
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(applications.createButcher).not.toHaveBeenCalled();
    expect(applications.updateApplicationStatus).not.toHaveBeenCalled();
  });

  it('does not approve when butcher account credentials are missing', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
      ...submittedApp,
      accountUsername: null,
      accountPasswordHash: null,
    });

    await expect(
      service.approveApplication('admin-1', TEST_APP_ID, {}),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CREDENTIALS_REQUIRED' });
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(applications.updateApplicationStatus).not.toHaveBeenCalled();
  });

  it('rejects rejection without reason', async () => {
    (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
      submittedApp,
    );

    await expect(
      service.rejectApplication('admin-1', TEST_APP_ID, {
        rejectionReason: '',
      }),
    ).rejects.toMatchObject({ code: 'REJECTION_REASON_REQUIRED' });
  });
});
