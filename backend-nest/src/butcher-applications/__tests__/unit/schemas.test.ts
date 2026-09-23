import {
  snapshotSchema,
  submitBodySchema,
  rejectBodySchema,
  documentUploadBodySchema,
  adminListQuerySchema,
  listQuerySchema,
} from '../../routes/schemas';
import {
  MAX_DOCUMENT_FILE_BYTES,
  MAX_SHOP_PHOTO_FILE_BYTES,
} from '../../constants';
import { TEST_USER_ID } from '../helpers/testUtils';

describe('route schemas', () => {
  describe('snapshotSchema', () => {
    it('accepts valid partial draft snapshot', () => {
      const result = snapshotSchema.safeParse({
        nameAr: 'ملحمة سرح',
        nameEn: 'Sarouh Butchery',
        shopPhone: '+966501234567',
        country: 'SA',
        city: 'Riyadh',
        cityAr: 'الرياض',
        address: 'King Fahd Road 123',
        addressAr: 'طريق الملك فهد ١٢٣',
        lat: 24.7,
        lng: 46.7,
        openTime: '08:00',
        closeTime: '22:00',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid phone and country', () => {
      expect(snapshotSchema.safeParse({ shopPhone: 'abc' }).success).toBe(
        false,
      );
      expect(snapshotSchema.safeParse({ country: 'US' }).success).toBe(false);
    });

    it('rejects equal open and close times', () => {
      const result = snapshotSchema.safeParse({
        openTime: '10:00',
        closeTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown fields', () => {
      expect(snapshotSchema.safeParse({ ownerName: 'x' }).success).toBe(false);
    });
  });

  describe('submitBodySchema', () => {
    it('requires literal true flags', () => {
      expect(
        submitBodySchema.safeParse({
          acceptedTerms: true,
          confirmAccuracy: true,
          accountUsername: 'shop_user',
          password: 'secret1',
          confirmPassword: 'secret1',
        }).success,
      ).toBe(true);
      expect(
        submitBodySchema.safeParse({
          acceptedTerms: false,
          confirmAccuracy: true,
        }).success,
      ).toBe(false);
      expect(submitBodySchema.safeParse({}).success).toBe(false);
      expect(
        submitBodySchema.safeParse({
          acceptedTerms: true,
          confirmAccuracy: true,
          accountUsername: 'shop_user',
          password: 'secret1',
          confirmPassword: 'mismatch',
        }).success,
      ).toBe(false);
    });
  });

  describe('rejectBodySchema', () => {
    it('requires rejection reason min length', () => {
      expect(
        rejectBodySchema.safeParse({ rejectionReason: 'short' }).success,
      ).toBe(false);
      expect(
        rejectBodySchema.safeParse({
          rejectionReason: 'Incomplete commercial registration documents',
        }).success,
      ).toBe(true);
    });
  });

  describe('documentUploadBodySchema', () => {
    const base = {
      type: 'commercial_license' as const,
      fileKey: `butcher-applications/${TEST_USER_ID}/license.pdf`,
      mimeType: 'application/pdf' as const,
      fileSizeBytes: 1000,
    };

    it('validates mime and size per type', () => {
      expect(documentUploadBodySchema.safeParse(base).success).toBe(true);
      expect(
        documentUploadBodySchema.safeParse({
          ...base,
          type: 'shop_photo',
          fileSizeBytes: MAX_SHOP_PHOTO_FILE_BYTES,
        }).success,
      ).toBe(true);
      expect(
        documentUploadBodySchema.safeParse({
          ...base,
          fileSizeBytes: MAX_DOCUMENT_FILE_BYTES + 1,
        }).success,
      ).toBe(false);
    });
  });

  describe('listQuerySchema', () => {
    it('rejects invalid cursor and limit', () => {
      expect(listQuerySchema.safeParse({ cursor: 'not-uuid' }).success).toBe(
        false,
      );
      expect(listQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(listQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    });
  });

  describe('adminListQuerySchema', () => {
    it('validates sort and search', () => {
      expect(
        adminListQuerySchema.safeParse({ sort: 'submittedAt_desc' }).success,
      ).toBe(true);
      expect(adminListQuerySchema.safeParse({ sort: 'invalid' }).success).toBe(
        false,
      );
      expect(adminListQuerySchema.safeParse({ search: 'a' }).success).toBe(
        false,
      );
    });

    it('rejects inverted date range', () => {
      const result = adminListQuerySchema.safeParse({
        submittedFrom: '2025-06-01',
        submittedTo: '2025-01-01',
      });
      expect(result.success).toBe(false);
    });
  });
});
