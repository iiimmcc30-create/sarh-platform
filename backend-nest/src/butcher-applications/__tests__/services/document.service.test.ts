import { ButcherApplicationDocumentService } from '../../services/document.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { DocumentRepository } from '../../repositories/document.repository';
import { TransactionService } from '../../services/transaction.service';
import { TEST_APP_ID, TEST_USER_ID } from '../helpers/testUtils';
import { MAX_DOCUMENT_FILE_BYTES } from '../../constants';

jest.mock('../../helpers/timeline', () => ({
  appendTimelineEvent: jest.fn().mockResolvedValue({
    id: 'event-1',
    action: 'UPDATE',
    comment: null,
    createdBy: 'user',
    metadata: {},
    createdAt: new Date(),
    actor: { id: 'user', username: 'user' },
  }),
}));

const draftApp = {
  id: TEST_APP_ID,
  userId: TEST_USER_ID,
  status: 'DRAFT' as const,
  documents: [],
};

describe('ButcherApplicationDocumentService', () => {
  const applications = {
    getApplicationByIdOrThrow: jest.fn(),
  } as unknown as ApplicationRepository;

  const documents = {
    findDocumentByApplicationAndType: jest.fn(),
    createDocument: jest.fn(),
    getDocumentOrThrow: jest.fn(),
    deleteDocument: jest.fn(),
  } as unknown as DocumentRepository;

  const transactions = {
    runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
    ),
  } as unknown as TransactionService;

  const service = new ButcherApplicationDocumentService(
    applications,
    documents,
    transactions,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (transactions.runInTransaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
  });

  describe('uploadDocument', () => {
    const input = {
      type: 'commercial_license' as const,
      fileKey: `butcher-applications/${TEST_USER_ID}/license.pdf`,
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
    };

    it('rejects invalid mime before transaction', async () => {
      await expect(
        service.uploadDocument(TEST_USER_ID, TEST_APP_ID, {
          ...input,
          mimeType: 'text/plain',
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_MIME_TYPE' });
      expect(transactions.runInTransaction).not.toHaveBeenCalled();
    });

    it('rejects invalid file key ownership', async () => {
      await expect(
        service.uploadDocument(TEST_USER_ID, TEST_APP_ID, {
          ...input,
          fileKey: 'butcher-applications/other-user/license.pdf',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FILE' });
    });

    it('rejects duplicate required document type', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
        draftApp,
      );
      (documents.findDocumentByApplicationAndType as jest.Mock).mockResolvedValue(
        { id: 'existing' },
      );

      await expect(
        service.uploadDocument(TEST_USER_ID, TEST_APP_ID, input),
      ).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_ALREADY_EXISTS' });
    });

    it('uploads document on valid input', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
        draftApp,
      );
      (documents.findDocumentByApplicationAndType as jest.Mock).mockResolvedValue(
        null,
      );
      (documents.createDocument as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        type: input.type,
        fileKey: input.fileKey,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        createdAt: new Date(),
      });

      const result = await service.uploadDocument(
        TEST_USER_ID,
        TEST_APP_ID,
        input,
      );
      expect(documents.createDocument).toHaveBeenCalled();
      expect(result.id).toBe('doc-1');
    });

    it('rejects oversized upload', async () => {
      await expect(
        service.uploadDocument(TEST_USER_ID, TEST_APP_ID, {
          ...input,
          fileSizeBytes: MAX_DOCUMENT_FILE_BYTES + 1,
        }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    });
  });

  describe('deleteDocument', () => {
    it('rejects delete on submitted application', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue({
        ...draftApp,
        status: 'SUBMITTED',
      });
      (documents.getDocumentOrThrow as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        applicationId: TEST_APP_ID,
      });

      await expect(
        service.deleteDocument(TEST_USER_ID, TEST_APP_ID, 'doc-1'),
      ).rejects.toMatchObject({ code: 'APPLICATION_NOT_EDITABLE' });
    });

    it('deletes document on draft', async () => {
      (applications.getApplicationByIdOrThrow as jest.Mock).mockResolvedValue(
        draftApp,
      );
      (documents.getDocumentOrThrow as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        applicationId: TEST_APP_ID,
        type: 'commercial_license',
      });
      (documents.deleteDocument as jest.Mock).mockResolvedValue(undefined);

      await service.deleteDocument(TEST_USER_ID, TEST_APP_ID, 'doc-1');
      expect(documents.deleteDocument).toHaveBeenCalled();
    });
  });
});
