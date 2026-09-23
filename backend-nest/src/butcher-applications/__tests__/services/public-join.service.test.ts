import jwt from 'jsonwebtoken';
import { PublicButcherJoinService } from '../../services/public-join.service';
import { TEST_USER_ID } from '../helpers/testUtils';
import { REQUIRED_DOCUMENT_TYPES } from '../../constants';

jest.mock('../../helpers/timeline', () => ({
  appendTimelineEvent: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../helpers/transaction', () => ({
  assertUserHasNoButcher: jest.fn().mockResolvedValue(undefined),
}));

const snapshot = {
  nameAr: 'ملحمة النخيل',
  nameEn: 'Nakheel Butcher',
  shopPhone: '+966501234567',
  commercialReg: 'CR-12345',
  country: 'SA' as const,
  city: 'Riyadh',
  cityAr: 'الرياض',
  address: 'Olaya street',
  addressAr: 'شارع العليا',
  lat: 24.7,
  lng: 46.7,
  openTime: '08:00',
  closeTime: '22:00',
};

function pdf(type: (typeof REQUIRED_DOCUMENT_TYPES)[number]) {
  return {
    type,
    file: {
      fieldname: type,
      originalname: `${type}.pdf`,
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.4 test'),
    } as Express.Multer.File,
  };
}

const requiredFiles = REQUIRED_DOCUMENT_TYPES.map((type) => pdf(type));

const uploadedDocs = REQUIRED_DOCUMENT_TYPES.map((type) => ({
  id: `doc-${type}`,
  type,
  fileKey: `butcher-applications/${TEST_USER_ID}/${type}.pdf`,
  status: 'UPLOADED',
}));

describe('PublicButcherJoinService', () => {
  const jwtSecret = 'y'.repeat(32);

  const submittedApp = {
    id: 'join-app-1',
    userId: TEST_USER_ID,
    applicationNumber: 7,
    status: 'SUBMITTED',
    ...snapshot,
    bioAr: null,
    bioEn: null,
    specialties: [],
    rejectionReason: null,
    acceptedTermsAt: new Date(),
    submittedAt: new Date(),
    approvedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    documents: uploadedDocs,
    timelineEvents: [],
    sourcedButcher: null,
    user: {
      id: TEST_USER_ID,
      username: 'joinuser',
      phone: '+966501234567',
      avatar: null,
    },
  };

  function token(phone = '+966501234567') {
    return jwt.sign({ phone, verified: true, purpose: 'join' }, jwtSecret, {
      expiresIn: '15m',
    });
  }

  function setup(opts: { existingUser?: boolean; submitted?: boolean } = {}) {
    const applications = {
      findActiveApplicationByUserAndStatus: jest.fn().mockResolvedValue(
        opts.submitted ? { id: 'existing' } : null,
      ),
      createApplication: jest.fn().mockResolvedValue(submittedApp),
      getApplicationByIdOrThrow: jest.fn().mockResolvedValue({
        ...submittedApp,
        status: 'DRAFT',
        documents: uploadedDocs,
      }),
      updateApplicationStatus: jest.fn().mockResolvedValue(submittedApp),
      updateApplicationSnapshot: jest.fn(),
    };
    const documents = {
      createDocument: jest.fn().mockResolvedValue({}),
      findDocumentByApplicationAndType: jest.fn().mockResolvedValue(null),
      replaceDocument: jest.fn(),
    };
    const transactions = {
      runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      ),
    };
    const authRepo = {
      findExistingUser: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({ id: TEST_USER_ID }),
      followKnowledgeCenter: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(async (args: { where?: { OR?: unknown; phone?: string } }) => {
          if (args?.where?.OR) return null;
          if (opts.existingUser) {
            return {
              id: TEST_USER_ID,
              username: 'joinuser',
              role: 'USER',
              isAI: false,
              butcherProfile: null,
            };
          }
          return null;
        }),
      },
    };
    const notifications = {
      notifyAfterApplicationSubmit: jest.fn().mockResolvedValue(undefined),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(jwtSecret) };
    const uploads = {
      uploadOwnedButcherApplicationFile: jest
        .fn()
        .mockImplementation(async (_userId: string, part: { type: string }) => ({
          fileKey: `butcher-applications/${TEST_USER_ID}/${part.type}.pdf`,
          mimeType: 'application/pdf',
          fileSizeBytes: 1024,
          originalFileName: `${part.type}.pdf`,
        })),
    };

    const service = new PublicButcherJoinService(
      applications as never,
      documents as never,
      transactions as never,
      authRepo as never,
      prisma as never,
      config as never,
      notifications as never,
      uploads as never,
      logger as never,
    );
    return { service, applications, authRepo, documents, uploads, logger };
  }

  const body = {
    phone: '+966501234567',
    phone_token: '',
    displayName: 'أحمد',
    username: 'ahmad_join',
    accountUsername: 'nakheel_shop',
    accountPassword: 'secret1',
    accountPasswordConfirm: 'secret1',
    acceptedTerms: true as const,
    confirmAccuracy: true as const,
    ...snapshot,
  };

  it('creates a submitted application after uploading required documents', async () => {
    const { service, applications, authRepo, documents, uploads } = setup();
    const result = await service.submitJoin(
      { ...body, phone_token: token() },
      requiredFiles,
    );
    expect(authRepo.createUser).toHaveBeenCalled();
    expect(uploads.uploadOwnedButcherApplicationFile).toHaveBeenCalledTimes(4);
    expect(documents.createDocument).toHaveBeenCalledTimes(4);
    expect(applications.createApplication).toHaveBeenCalled();
    expect(applications.updateApplicationStatus).toHaveBeenCalled();
    expect(result.applicationNumber).toBe(7);
    expect(result.status).toBe('SUBMITTED');
  });

  it('rejects submit when a required document is missing', async () => {
    const { service, authRepo, uploads } = setup();
    await expect(
      service.submitJoin({ ...body, phone_token: token() }, [
        pdf('commercial_license'),
      ]),
    ).rejects.toMatchObject({ code: 'DOCUMENT_REQUIRED' });
    expect(authRepo.createUser).not.toHaveBeenCalled();
    expect(uploads.uploadOwnedButcherApplicationFile).not.toHaveBeenCalled();
  });

  it('rejects submit without a verified phone token', async () => {
    const { service } = setup();
    await expect(
      service.submitJoin({ ...body, phone_token: 'not-a-jwt' }, requiredFiles),
    ).rejects.toMatchObject({ error: 'invalid_phone_token' });
  });

  it('blocks duplicate submitted applications', async () => {
    const { service } = setup({ existingUser: true, submitted: true });
    await expect(
      service.submitJoin({ ...body, phone_token: token() }, requiredFiles),
    ).rejects.toMatchObject({ code: 'ACTIVE_SUBMITTED_EXISTS' });
  });

  it('does not log phone tokens or file contents', async () => {
    const { service, logger } = setup();
    await service.submitJoin({ ...body, phone_token: token() }, requiredFiles);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('phone_token');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('%PDF');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret1');
  });
});
