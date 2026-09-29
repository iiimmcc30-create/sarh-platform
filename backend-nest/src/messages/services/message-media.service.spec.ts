import { ApiException } from '../../common/exceptions/api.exception';
import type { ResolvedMessagePayload } from '../lib/message-payload';

const mockInspect = jest.fn();
const mockDestroy = jest.fn();
const mockSign = jest.fn(
  (ref: { publicId: string }) =>
    `https://res.cloudinary.com/sarh/video/authenticated/s--SIGNED1--/${ref.publicId}`,
);
let mockProvider = 'cloudinary';
let mockOurUrl = false;

jest.mock('@/lib/storage', () => ({
  getStorageProvider: () => mockProvider,
  getCloudinaryCloudName: () => 'sarh',
  getCloudinaryBaseFolder: () => 'safat',
  inspectCloudinaryAsset: (...a: unknown[]) => mockInspect(...a),
  destroyCloudinaryAsset: (...a: unknown[]) => mockDestroy(...a),
  signedCloudinaryDeliveryUrl: (ref: { publicId: string }) => mockSign(ref),
  isOurUploadUrl: () => mockOurUrl,
  localUploadSizeBytes: () => null,
  s3KeyFromUrl: () => null,
  s3ObjectSizeBytes: jest.fn(),
  deleteS3Object: jest.fn(),
}));

import { MessageMediaService } from './message-media.service';

const MB = 1024 * 1024;
const PROTECTED_VOICE =
  'https://res.cloudinary.com/sarh/video/authenticated/s--abcdef12--/v17/safat/messages/alice/v1.m4a';
const LEGACY_IMAGE =
  'https://res.cloudinary.com/sarh/image/upload/v16/safat/messages/old.jpg';

function voice(url = PROTECTED_VOICE): ResolvedMessagePayload {
  return { type: 'VOICE', audioUrl: url, mediaDurationMs: 3000 };
}

async function status(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err instanceof ApiException ? err.status : -1;
  }
}

describe('MessageMediaService', () => {
  let service: MessageMediaService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = 'cloudinary';
    mockOurUrl = false;
    mockDestroy.mockResolvedValue(undefined);
    service = new MessageMediaService({
      warn: jest.fn(),
      info: jest.fn(),
    } as never);
  });

  it('accepts an own protected voice note, stores the unsigned URL and real size', async () => {
    mockInspect.mockResolvedValue({
      bytes: 2 * MB,
      resourceType: 'video',
      version: '17',
      format: 'm4a',
    });
    const out = await service.verifyForSend('alice', voice());
    expect(out.audioUrl).toBe(
      'https://res.cloudinary.com/sarh/video/authenticated/v17/safat/messages/alice/v1.m4a',
    );
    expect(out.mediaSizeBytes).toBe(2 * MB);
    expect(mockInspect).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryType: 'authenticated',
        resourceType: 'video',
        publicId: 'safat/messages/alice/v1',
      }),
    );
  });

  it('rejects and deletes an oversized voice note (presign bypass) with 413', async () => {
    mockInspect.mockResolvedValue({ bytes: 11 * MB, resourceType: 'video' });
    await expect(service.verifyForSend('alice', voice())).rejects.toMatchObject(
      {
        messageAr: expect.stringContaining('10 ميجابايت'),
      },
    );
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['IMAGE', 'imageUrl', 'image', 21],
    ['VIDEO', 'videoUrl', 'video', 51],
  ] as const)('rejects %s above the limit', async (type, field, rt, mb) => {
    mockInspect.mockResolvedValue({ bytes: mb * MB, resourceType: rt });
    const url = `https://res.cloudinary.com/sarh/${rt}/upload/v1/safat/messages/big.bin`;
    expect(
      await status(
        service.verifyForSend('alice', {
          type,
          [field]: url,
        } as ResolvedMessagePayload),
      ),
    ).toBe(413);
  });

  it("forbids referencing another user's protected upload", async () => {
    const url =
      'https://res.cloudinary.com/sarh/video/authenticated/v1/safat/messages/bob/x.m4a';
    expect(await status(service.verifyForSend('alice', voice(url)))).toBe(403);
    expect(mockInspect).not.toHaveBeenCalled();
  });

  it('keeps legacy public images working (URL unchanged, size verified)', async () => {
    mockInspect.mockResolvedValue({ bytes: 1 * MB, resourceType: 'image' });
    const out = await service.verifyForSend('alice', {
      type: 'IMAGE',
      imageUrl: LEGACY_IMAGE,
    });
    expect(out.imageUrl).toBe(LEGACY_IMAGE);
  });

  it('rejects missing assets and fails closed when Cloudinary is unreachable', async () => {
    mockInspect.mockResolvedValueOnce(null);
    expect(await status(service.verifyForSend('alice', voice()))).toBe(400);
    mockInspect.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await status(service.verifyForSend('alice', voice()))).toBe(503);
  });

  it('rejects foreign media URLs', async () => {
    expect(
      await status(
        service.verifyForSend('alice', {
          type: 'IMAGE',
          imageUrl: 'https://evil.example.com/a.jpg',
        }),
      ),
    ).toBe(400);
  });

  it('passes text messages through untouched', async () => {
    const p: ResolvedMessagePayload = { type: 'TEXT', text: 'مرحبا' };
    await expect(service.verifyForSend('alice', p)).resolves.toBe(p);
  });

  it('signs protected URLs on read and leaves legacy URLs as-is', () => {
    const msgs = service.presentMessages([
      { id: '1', audioUrl: PROTECTED_VOICE },
      { id: '2', imageUrl: LEGACY_IMAGE },
    ]);
    expect(msgs[0].audioUrl).toContain('s--SIGNED1--');
    expect(msgs[1].imageUrl).toBe(LEGACY_IMAGE);
  });
});
