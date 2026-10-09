import {
  assertUserMediaUrls,
  classifyMediaUrl,
  allowedFormatsForMime,
} from './media-ownership';
import { destroyCloudinaryAsset, inspectCloudinaryAsset } from './storage';

jest.mock('./storage', () => {
  const actual = jest.requireActual('./storage') as Record<string, unknown>;
  return {
    ...actual,
    getCloudinaryCloudName: () => 'sarhcloud',
    getCloudinaryBaseFolder: () => 'sarh',
    getStorageProvider: () => 'cloudinary',
    inspectCloudinaryAsset: jest.fn(),
    destroyCloudinaryAsset: jest.fn().mockResolvedValue(undefined),
  };
});

const inspect = inspectCloudinaryAsset as jest.Mock;
const destroy = destroyCloudinaryAsset as jest.Mock;

const ME = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const ASSET = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const img = (path: string, cloud = 'sarhcloud') =>
  `https://res.cloudinary.com/${cloud}/image/upload/v1700000000/${path}.jpg`;

describe('classifyMediaUrl', () => {
  it('accepts my own per-user upload', () => {
    expect(
      classifyMediaUrl(img(`sarh/listings/${ME}/${ASSET}`), ME),
    ).toMatchObject({
      ok: true,
      ownedByUser: true,
    });
  });

  it('rejects foreign hosts and other Cloudinary clouds', () => {
    expect(classifyMediaUrl('https://evil.example/x.jpg', ME)).toEqual({
      ok: false,
      reason: 'foreign_host',
    });
    expect(
      classifyMediaUrl(img(`sarh/listings/${ME}/${ASSET}`, 'someoneelse'), ME),
    ).toEqual({ ok: false, reason: 'foreign_host' });
  });

  it("rejects another user's per-user upload (admins may keep it)", () => {
    const url = img(`sarh/listings/${OTHER}/${ASSET}`);
    expect(classifyMediaUrl(url, ME)).toEqual({
      ok: false,
      reason: 'other_user',
    });
    expect(classifyMediaUrl(url, ME, { allowAnyOwner: true })).toMatchObject({
      ok: true,
    });
  });

  it('rejects folders outside our user media folders and protected chat media', () => {
    expect(classifyMediaUrl(img(`random/${ASSET}`), ME)).toEqual({
      ok: false,
      reason: 'foreign_folder',
    });
    expect(classifyMediaUrl(img(`sarh/support/${ME}/${ASSET}`), ME)).toEqual({
      ok: false,
      reason: 'foreign_folder',
    });
    expect(
      classifyMediaUrl(
        `https://res.cloudinary.com/sarhcloud/image/authenticated/v1/sarh/messages/${ME}/${ASSET}.jpg`,
        ME,
      ),
    ).toEqual({ ok: false, reason: 'not_public' });
  });

  it('handles transformation segments before the public_id', () => {
    const url = `https://res.cloudinary.com/sarhcloud/video/upload/so_0,w_400/sarh/listings/${ME}/${ASSET}.jpg`;
    expect(classifyMediaUrl(url, ME)).toMatchObject({ ok: true });
  });

  it('keeps legacy shared-folder uploads unless the strict flag is on', () => {
    const legacy = img(`sarh/listings/${ASSET}`);
    expect(classifyMediaUrl(legacy, ME)).toMatchObject({
      ok: true,
      ownedByUser: false,
    });
    process.env.UPLOAD_REJECT_LEGACY_SHARED_MEDIA = 'true';
    try {
      expect(classifyMediaUrl(legacy, ME)).toEqual({
        ok: false,
        reason: 'legacy_rejected',
      });
    } finally {
      delete process.env.UPLOAD_REJECT_LEGACY_SHARED_MEDIA;
    }
  });

  it('maps MIME types to Cloudinary allowed_formats', () => {
    expect(allowedFormatsForMime('image/jpeg')).toContain('jpg');
    expect(allowedFormatsForMime('image/jpeg')).not.toContain('svg');
    expect(allowedFormatsForMime('video/mp4')).toBe('mp4,mov,webm,m4v');
    expect(allowedFormatsForMime('application/pdf')).toBe('pdf');
  });
});

describe('assertUserMediaUrls (production)', () => {
  const prevEnv = process.env.NODE_ENV;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';
    inspect.mockResolvedValue({
      bytes: 1024,
      resourceType: 'image',
      format: 'jpg',
    });
  });
  afterAll(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it('is a no-op outside production', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      assertUserMediaUrls(['https://evil.example/x.jpg'], ME),
    ).resolves.toBeUndefined();
  });

  it('rejects a foreign URL with 400', async () => {
    await expect(
      assertUserMediaUrls(['https://evil.example/x.jpg'], ME),
    ).rejects.toMatchObject({ status: 400 });
    expect(inspect).not.toHaveBeenCalled();
  });

  it('keeps URLs already on the entity without inspecting them', async () => {
    const old = 'https://images.unsplash.com/seed.jpg';
    await expect(
      assertUserMediaUrls([old], ME, { existing: [old] }),
    ).resolves.toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('accepts my own upload within limits', async () => {
    await expect(
      assertUserMediaUrls(
        [img(`sarh/posts/${ME}/${ASSET}`), null, undefined],
        ME,
      ),
    ).resolves.toBeUndefined();
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized image (413) and deletes my own fresh asset', async () => {
    inspect.mockResolvedValue({
      bytes: 30 * 1024 * 1024,
      resourceType: 'image',
      format: 'jpg',
    });
    await expect(
      assertUserMediaUrls([img(`sarh/listings/${ME}/${ASSET}`)], ME),
    ).rejects.toMatchObject({ status: 413 });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('never deletes a legacy shared asset, but still rejects it when oversized', async () => {
    inspect.mockResolvedValue({
      bytes: 30 * 1024 * 1024,
      resourceType: 'image',
      format: 'jpg',
    });
    await expect(
      assertUserMediaUrls([img(`sarh/listings/${ASSET}`)], ME),
    ).rejects.toMatchObject({ status: 413 });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('rejects a disallowed stored format', async () => {
    inspect.mockResolvedValue({
      bytes: 1024,
      resourceType: 'image',
      format: 'svg',
    });
    await expect(
      assertUserMediaUrls([img(`sarh/listings/${ME}/${ASSET}`)], ME),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a missing asset and reports 503 when Cloudinary is down', async () => {
    inspect.mockResolvedValueOnce(null);
    await expect(
      assertUserMediaUrls([img(`sarh/listings/${ME}/${ASSET}`)], ME),
    ).rejects.toMatchObject({ status: 400 });
    inspect.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      assertUserMediaUrls([img(`sarh/listings/${ME}/${ASSET}`)], ME),
    ).rejects.toMatchObject({ status: 503 });
  });
});
