import { UploadService } from './upload.service';
import { ApiException } from '../common/exceptions/api.exception';
import { getPresignedUploadUrl, getStorageProvider } from '@/lib/storage';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

jest.mock('@/lib/storage', () => ({
  getStorageProvider: jest.fn(),
  getPresignedUploadUrl: jest.fn(),
}));

function jwt(): JwtPayload {
  return { userId: 'user-a', username: 'user-a', role: 'USER' };
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

  it('rejects disallowed mime types for listings folder', async () => {
    await expect(
      service.presign(jwt(), {
        mimetype: 'application/pdf',
        folder: 'listings',
        count: 1,
      }),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ApiException>);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('issues a signed Cloudinary slot', async () => {
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({
      provider: 'cloudinary',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      apiKey: 'pub-key',
      timestamp: 1,
      signature: 'signed',
      folder: 'safat/listings',
      publicId: 'abc',
    });

    const result = await service.presign(jwt(), {
      mimetype: 'image/jpeg',
      folder: 'listings',
    });

    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      'listings',
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

  it('allows image and supported video MIME types for posts', async () => {
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({
      provider: 'cloudinary',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
      apiKey: 'pub-key',
      timestamp: 1,
      signature: 'signed',
      folder: 'safat/posts',
      publicId: 'vid',
    });

    const image = await service.presign(jwt(), {
      mimetype: 'image/jpeg',
      folder: 'posts',
    });
    expect(image.maxSizeMb).toBe(20);

    const video = await service.presign(jwt(), {
      mimetype: 'video/mp4',
      folder: 'posts',
    });
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      'posts',
      'video/mp4',
      300,
      undefined,
    );
    expect(video.maxSizeMb).toBe(50);
  });

  it('rejects unsupported MIME types for posts', async () => {
    await expect(
      service.presign(jwt(), {
        mimetype: 'application/pdf',
        folder: 'posts',
        count: 1,
      }),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ApiException>);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('returns 503 when storage signing fails', async () => {
    (getPresignedUploadUrl as jest.Mock).mockRejectedValue(
      new Error('Cloudinary is not configured'),
    );
    await expect(
      service.presign(jwt(), { mimetype: 'image/png', folder: 'listings' }),
    ).rejects.toMatchObject({ status: 503 } satisfies Partial<ApiException>);
  });
});
