import { apiClient } from '@/services/api.client';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  assertImageFile,
  BUTCHER_UPLOAD_FOLDER,
  uploadButcherImage,
} from '@/services/upload.service';

jest.mock('@/services/api.client', () => ({
  apiClient: { post: jest.fn() },
  unwrap: (res: { data: { success: boolean; data?: unknown; messageAr?: string } }) => {
    if (!res.data.success || res.data.data === undefined) {
      throw new Error(res.data.messageAr ?? 'خطأ في الخادم');
    }
    return res.data.data;
  },
}));

function jpegFile(name = 'logo.jpg', size = 128): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' });
}

describe('assertImageFile', () => {
  it('rejects disallowed mime types', () => {
    const pdf = new File([new Uint8Array(10)], 'x.pdf', { type: 'application/pdf' });
    expect(() => assertImageFile(pdf)).toThrow(/نوع الملف غير مدعوم/);
    expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('application/pdf');
  });

  it('rejects files larger than the max size', () => {
    const huge = new File([new Uint8Array(3)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 });
    expect(() => assertImageFile(huge, 20)).toThrow(/حجم الصورة يتجاوز/);
  });

  it('accepts jpeg/png/webp/gif within size', () => {
    expect(() => assertImageFile(jpegFile())).not.toThrow();
    expect(() =>
      assertImageFile(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })),
    ).not.toThrow();
  });
});

describe('uploadButcherImage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('presigns through NestJS with folder butchers and never sends butcherId or API secret', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          maxSizeMb: 20,
          urls: [
            {
              provider: 'cloudinary',
              uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
              apiKey: 'pub-key',
              timestamp: 1,
              signature: 'signed',
              folder: 'safat/butchers',
              publicId: 'abc',
            },
          ],
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/logo.jpg' }),
    });

    const url = await uploadButcherImage(jpegFile());
    expect(url).toBe('https://res.cloudinary.com/demo/image/upload/v1/logo.jpg');

    const [path, body] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(path).toBe('/upload/presign');
    expect(body).toEqual({
      mimetype: 'image/jpeg',
      folder: BUTCHER_UPLOAD_FOLDER,
      count: 1,
    });
    expect(body).not.toHaveProperty('butcherId');
    expect(JSON.stringify(body)).not.toMatch(/secret/i);

    const fetchInit = (global.fetch as jest.Mock).mock.calls[0][1] as { body: FormData };
    const form = fetchInit.body;
    expect(form.get('api_key')).toBe('pub-key');
    expect(form.get('signature')).toBe('signed');
    expect(form.has('api_secret')).toBe(false);
  });

  it('uploads via S3 PUT then returns the CDN URL', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          urls: [
            {
              provider: 's3',
              uploadUrl: 'https://bucket.s3.amazonaws.com/signed',
              cdnUrl: 'https://cdn.example.com/butchers/x.jpg',
            },
          ],
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const url = await uploadButcherImage(jpegFile());
    expect(url).toBe('https://cdn.example.com/butchers/x.jpg');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://bucket.s3.amazonaws.com/signed',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('uses local /upload/direct for STORAGE_PROVIDER=local slots', async () => {
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            urls: [{ provider: 'local', uploadUrl: '/api/upload/direct', folder: 'butchers' }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { url: 'http://127.0.0.1:3001/uploads/butchers/x.jpg' } },
      });

    const url = await uploadButcherImage(jpegFile());
    expect(url).toContain('/uploads/butchers/');
    expect((apiClient.post as jest.Mock).mock.calls[1][0]).toBe('/upload/direct?folder=butchers');
  });

  it('surfaces Cloudinary upload failure', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          urls: [
            {
              provider: 'cloudinary',
              uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
              apiKey: 'pub-key',
              timestamp: 1,
              signature: 'signed',
              folder: 'safat/butchers',
              publicId: 'abc',
            },
          ],
        },
      },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Upload failed' } }),
    });

    await expect(uploadButcherImage(jpegFile())).rejects.toThrow('Upload failed');
  });

  it('rejects oversized files before calling the API', async () => {
    const huge = jpegFile();
    Object.defineProperty(huge, 'size', { value: 30 * 1024 * 1024 });
    await expect(uploadButcherImage(huge)).rejects.toThrow(/حجم الصورة يتجاوز/);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
