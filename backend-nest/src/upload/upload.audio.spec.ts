import {
  maxUploadSizeMb,
  MESSAGE_AUDIO_MIME_TYPES,
  normalizeUploadMime,
  UploadService,
} from './upload.service';
import { mimeMatchesMagic, sniffFileKind } from './file-magic';
import { getPresignedUploadUrl, getStorageProvider } from '@/lib/storage';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

jest.mock('@/lib/storage', () => ({
  getStorageProvider: jest.fn(),
  getPresignedUploadUrl: jest.fn(),
}));

const jwt: JwtPayload = { userId: 'user-a', username: 'user-a', role: 'USER' };

describe('voice message uploads', () => {
  let service: UploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getStorageProvider as jest.Mock).mockReturnValue('cloudinary');
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({
      provider: 'cloudinary',
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
    });
    service = new UploadService(
      { isEnabled: () => false } as never,
      { info: jest.fn(), error: jest.fn() } as never,
    );
  });

  it('accepts whitelisted audio mimes in the messages folder with a 10MB cap', async () => {
    for (const mimetype of [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/x-m4a',
    ]) {
      const res = await service.presign(jwt, { mimetype, folder: 'messages' });
      expect(res.maxSizeMb).toBe(10);
    }
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      'messages',
      'audio/webm',
      300,
      expect.objectContaining({ signFormats: false }),
    );
  });

  it('rejects audio outside the messages folder and non-whitelisted audio', async () => {
    await expect(
      service.presign(jwt, { mimetype: 'audio/mp4', folder: 'listings' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.presign(jwt, { mimetype: 'audio/x-ms-wma', folder: 'messages' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps image/video limits unchanged', () => {
    expect(maxUploadSizeMb('messages', 'image/jpeg')).toBe(20);
    expect(maxUploadSizeMb('messages', 'video/mp4')).toBe(50);
    expect(maxUploadSizeMb('messages', 'audio/webm')).toBe(10);
    expect(maxUploadSizeMb('support', 'image/png')).toBe(25);
  });

  it('normalizes codec parameters', () => {
    expect(normalizeUploadMime('Audio/WebM; codecs=opus')).toBe('audio/webm');
    expect(MESSAGE_AUDIO_MIME_TYPES).toContain('audio/mp4');
  });

  it('sniffs audio containers and rejects spoofed audio', () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
    const ogg = Buffer.from('OggS\0\u0002');
    const m4a = Buffer.concat([
      Buffer.from([0, 0, 0, 0x20]),
      Buffer.from('ftypM4A '),
    ]);
    expect(sniffFileKind(webm)).toBe('webm');
    expect(sniffFileKind(ogg)).toBe('ogg');
    expect(mimeMatchesMagic('audio/webm;codecs=opus', webm)).toBe(true);
    expect(mimeMatchesMagic('audio/ogg', ogg)).toBe(true);
    expect(mimeMatchesMagic('audio/x-m4a', m4a)).toBe(true);
    expect(mimeMatchesMagic('audio/webm', Buffer.from('%PDF-1.4'))).toBe(false);
  });

  it('opts chat uploads into protected delivery only when requested', async () => {
    await service.presign(jwt, {
      mimetype: 'audio/mp4',
      folder: 'messages',
      delivery: 'authenticated',
    });
    expect(getPresignedUploadUrl).toHaveBeenLastCalledWith(
      'messages',
      'audio/mp4',
      300,
      { userId: 'user-a', protectedDelivery: true, signFormats: false },
    );
    // Old app builds (no `delivery`) keep the legacy public slot.
    await service.presign(jwt, { mimetype: 'audio/mp4', folder: 'messages' });
    expect(getPresignedUploadUrl).toHaveBeenLastCalledWith(
      'messages',
      'audio/mp4',
      300,
      expect.objectContaining({ signFormats: false }),
    );
    // `delivery` is ignored outside the messages folder.
    await service.presign(jwt, {
      mimetype: 'image/jpeg',
      folder: 'listings',
      delivery: 'authenticated',
    });
    expect(getPresignedUploadUrl).toHaveBeenLastCalledWith(
      'listings',
      'image/jpeg',
      300,
      expect.objectContaining({ signFormats: false }),
    );
  });
});
