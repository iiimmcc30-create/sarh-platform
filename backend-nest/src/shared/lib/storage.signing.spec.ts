import { v2 as cloudinary } from 'cloudinary';

type StorageModule = typeof import('./storage');

function loadStorage(): StorageModule {
  let mod: StorageModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./storage') as StorageModule;
  });
  return mod!;
}

describe('Cloudinary upload slot signing', () => {
  const keys = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_FOLDER',
    'STORAGE_PROVIDER',
  ] as const;
  const prev: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.CLOUDINARY_CLOUD_NAME = 'sarhcloud';
    process.env.CLOUDINARY_API_KEY = 'public-key';
    process.env.CLOUDINARY_API_SECRET = 'unit-test-secret-not-real';
    process.env.CLOUDINARY_FOLDER = 'sarh';
    process.env.STORAGE_PROVIDER = 'cloudinary';
  });
  afterAll(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('puts public media in a per-user folder and signs allowed_formats when asked', async () => {
    const storage = loadStorage();
    const slot = await storage.getPresignedUploadUrl(
      'listings',
      'image/jpeg',
      300,
      {
        userId: 'user-1',
        signFormats: true,
      },
    );
    if (slot.provider !== 'cloudinary') throw new Error('expected cloudinary');
    expect(slot.folder).toBe('sarh/listings/user-1');
    expect(slot.allowedFormats).toContain('jpg');
    const expected = cloudinary.utils.api_sign_request(
      {
        timestamp: slot.timestamp,
        folder: slot.folder,
        public_id: slot.publicId,
        allowed_formats: slot.allowedFormats!,
      },
      'unit-test-secret-not-real',
    );
    expect(slot.signature).toBe(expected);
    expect(JSON.stringify(slot)).not.toContain('unit-test-secret-not-real');
  });

  it('legacy clients keep the exact old signed params (no allowed_formats)', async () => {
    const storage = loadStorage();
    const slot = await storage.getPresignedUploadUrl(
      'posts',
      'video/mp4',
      300,
      {
        userId: 'user-1',
      },
    );
    if (slot.provider !== 'cloudinary') throw new Error('expected cloudinary');
    expect(slot.allowedFormats).toBeUndefined();
    expect(slot.signature).toBe(
      cloudinary.utils.api_sign_request(
        {
          timestamp: slot.timestamp,
          folder: slot.folder,
          public_id: slot.publicId,
        },
        'unit-test-secret-not-real',
      ),
    );
  });

  it('leaves public chat media in the shared messages folder', async () => {
    const storage = loadStorage();
    const slot = await storage.getPresignedUploadUrl(
      'messages',
      'image/jpeg',
      300,
      {
        userId: 'user-1',
      },
    );
    if (slot.provider !== 'cloudinary') throw new Error('expected cloudinary');
    expect(slot.folder).toBe('sarh/messages');
  });
});
