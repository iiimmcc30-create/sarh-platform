import {
  buildPaginatedResult,
  validateDocumentUploadInput,
  assertFileKeyOwnedByUser,
  collectChangedFields,
} from '../../helpers/validation';
import { ButcherApplicationError } from '../../errors';
import { MAX_DOCUMENT_FILE_BYTES } from '../../constants';
import { TEST_USER_ID } from '../helpers/testUtils';

describe('validation helpers', () => {
  describe('buildPaginatedResult', () => {
    it('returns page without cursor when within limit', () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      expect(buildPaginatedResult(rows, 5)).toEqual({
        items: rows,
        nextCursor: null,
        hasMore: false,
      });
    });

    it('trims extra row and sets nextCursor', () => {
      const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const page = buildPaginatedResult(rows, 2);
      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).toBe('b');
    });
  });

  describe('validateDocumentUploadInput', () => {
    const base = {
      type: 'commercial_license' as const,
      fileKey: `butcher-applications/${TEST_USER_ID}/license.pdf`,
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
    };

    it('rejects unsupported mime', () => {
      expect(() =>
        validateDocumentUploadInput({ ...base, mimeType: 'text/plain' }),
      ).toThrow(ButcherApplicationError);
    });

    it('rejects oversized file', () => {
      expect(() =>
        validateDocumentUploadInput({
          ...base,
          fileSizeBytes: MAX_DOCUMENT_FILE_BYTES + 1,
        }),
      ).toThrow(ButcherApplicationError);
    });

    it('rejects short file key', () => {
      expect(() =>
        validateDocumentUploadInput({ ...base, fileKey: 'short' }),
      ).toThrow(ButcherApplicationError);
    });
  });

  describe('assertFileKeyOwnedByUser', () => {
    it('accepts user-scoped key', () => {
      expect(() =>
        assertFileKeyOwnedByUser(
          `butcher-applications/${TEST_USER_ID}/doc.pdf`,
          TEST_USER_ID,
        ),
      ).not.toThrow();
    });

    it('rejects cross-user key', () => {
      expect(() =>
        assertFileKeyOwnedByUser(
          'butcher-applications/other-user/doc.pdf',
          TEST_USER_ID,
        ),
      ).toThrow(ButcherApplicationError);
    });
  });

  describe('collectChangedFields', () => {
    it('lists changed keys only', () => {
      expect(
        collectChangedFields(
          { nameAr: 'old', city: 'Riyadh' },
          { nameAr: 'new', city: 'Riyadh' },
        ),
      ).toEqual(['nameAr']);
    });
  });
});
