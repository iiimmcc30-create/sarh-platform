import { documentPreviewKind } from '../../helpers/documentUrl';
import { withAdminDocumentUrls, toApplicationDetail } from '../../mappers';
import { TEST_APP_ID, TEST_USER_ID } from '../helpers/testUtils';

jest.mock('@/lib/storage', () => ({
  getStoredObjectUrl: jest.fn(async (key: string) => `https://cdn.example/${key}`),
}));

describe('application document URLs', () => {
  it('classifies image and pdf previews', () => {
    expect(documentPreviewKind('image/jpeg', 'a.jpg')).toBe('image');
    expect(documentPreviewKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(documentPreviewKind('application/pdf', 'license')).toBe('pdf');
    expect(documentPreviewKind('image/png', 'shot.png')).toBe('image');
  });

  it('adds fileUrl only for admin document mapping', async () => {
    const app = {
      id: TEST_APP_ID,
      userId: TEST_USER_ID,
      applicationNumber: 1,
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
      specialties: [],
      openTime: '08:00',
      closeTime: '22:00',
      accountUsername: 'shop_user',
      accountEmail: 'shop@example.com',
      accountPasswordHash: '$2b$12$not-for-api',
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
          id: 'doc-1',
          type: 'shop_photo' as const,
          fileKey: 'butcher-applications/u1/photo.png',
          status: 'UPLOADED' as const,
          notes: null,
          originalFileName: 'photo.png',
          mimeType: 'image/png',
          fileSizeBytes: 1200,
          verifiedBy: null,
          verifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'doc-2',
          type: 'commercial_license' as const,
          fileKey: 'butcher-applications/u1/license.pdf',
          status: 'UPLOADED' as const,
          notes: null,
          originalFileName: 'license.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 2200,
          verifiedBy: null,
          verifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      timelineEvents: [],
      sourcedButcher: null,
      user: { id: TEST_USER_ID, username: 'user', phone: null, avatar: null, role: 'USER' },
    };

    const publicDto = toApplicationDetail(app as never);
    expect(publicDto.documents[0]?.fileUrl).toBeUndefined();
    expect(JSON.stringify(publicDto)).not.toContain('accountPasswordHash');
    expect(JSON.stringify(publicDto)).not.toContain('$2b$12$not-for-api');
    expect(publicDto.accountUsername).toBe('shop_user');

    const adminDto = await withAdminDocumentUrls(
      toApplicationDetail(app as never, { includeAdminFields: true }),
    );
    expect(adminDto.documents[0]?.fileUrl).toBe(
      'https://cdn.example/butcher-applications/u1/photo.png',
    );
    expect(adminDto.documents[1]?.fileUrl).toBe(
      'https://cdn.example/butcher-applications/u1/license.pdf',
    );
    expect(JSON.stringify(adminDto)).not.toContain('accountPasswordHash');
  });
});
