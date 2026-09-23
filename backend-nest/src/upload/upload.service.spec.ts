import { UploadService } from './upload.service';
import { ApiException } from '../common/exceptions/api.exception';
import { getPresignedUploadUrl, getStorageProvider } from '@/lib/storage';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

jest.mock('@/lib/storage', () => ({
  getStorageProvider: jest.fn(),
  getPresignedUploadUrl: jest.fn(),
}));

function jwt(): JwtPayload {
  return { userId: 'user-a', username: 'user-a', role: 'BUTCHER' };
}

describe('UploadService presign (existing storage)', () => {
  const sessions = {
    isEnabled: jest.fn().mockReturnValue(false),
  };
  const logger = { info: jest.fn(), error: jest.fn() };
  let service: UploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getStorageProvider as jest.Mock).mockReturnValue('cloudinary');
    service = new UploadService(sessions as never, logger as never);
  });

  it('rejects disallowed mime types for butchers folder', async () => {
    await expect(
      service.presign(jwt(), {
        mimetype: 'application/pdf',
        folder: 'butchers',
        count: 1,
      }),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ApiException>);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('issues a signed Cloudinary slot without requiring a client butcherId', async () => {
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({
      provider: 'cloudinary',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      apiKey: 'pub-key',
      timestamp: 1,
      signature: 'signed',
      folder: 'safat/butchers',
      publicId: 'abc',
    });

    const result = await service.presign(jwt(), {
      mimetype: 'image/jpeg',
      folder: 'butchers',
    });

    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      'butchers',
      'image/jpeg',
      300,
      undefined,
    );
    expect(result.maxSizeMb).toBe(20);
    expect(result.urls[0]).toEqual(
      expect.objectContaining({
        provider: 'cloudinary',
        apiKey: 'pub-key',
        signature: 'signed',
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/api_secret|API_SECRET/i);
  });

  it('rejects join documents with unsupported mime or oversized files', async () => {
    await expect(
      service.uploadOwnedButcherApplicationFile('user-a', {
        type: 'commercial_license',
        file: {
          mimetype: 'text/plain',
          size: 10,
          buffer: Buffer.from('hello'),
          originalname: 'a.txt',
        } as Express.Multer.File,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MIME_TYPE' });

    await expect(
      service.uploadOwnedButcherApplicationFile('user-a', {
        type: 'national_id',
        file: {
          mimetype: 'application/pdf',
          size: 11 * 1024 * 1024,
          buffer: Buffer.from('%PDF-1.4'),
          originalname: 'id.pdf',
        } as Express.Multer.File,
      }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('stores a join document with a user-owned butcher-applications key', async () => {
    (getStorageProvider as jest.Mock).mockReturnValue('local');
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({
      provider: 'local',
      uploadUrl: '/api/upload/direct',
      folder: 'butcher-applications',
    });
    const result = await service.uploadOwnedButcherApplicationFile('user-a', {
      type: 'shop_photo',
      file: {
        mimetype: 'image/jpeg',
        size: 12,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]),
        originalname: 'shop.jpg',
      } as Express.Multer.File,
    });
    expect(result.fileKey).toMatch(/^butcher-applications\/user-a\//);
    expect(result.mimeType).toBe('image/jpeg');
    expect(JSON.stringify(result)).not.toMatch(/api_secret|APIKEY/i);
  });

  it('returns 503 when storage signing fails', async () => {
    (getPresignedUploadUrl as jest.Mock).mockRejectedValue(
      new Error('Cloudinary is not configured'),
    );
    await expect(
      service.presign(jwt(), { mimetype: 'image/png', folder: 'butchers' }),
    ).rejects.toMatchObject({ status: 503 } satisfies Partial<ApiException>);
  });
});
