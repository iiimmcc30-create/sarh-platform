const mockApiSignRequest = jest.fn(() => 'sig');
const mockCloudinaryUrl = jest.fn(() => 'https://signed.example/x');

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    utils: { api_sign_request: mockApiSignRequest },
    url: mockCloudinaryUrl,
    uploader: { explicit: jest.fn(), destroy: jest.fn() },
  },
}));

type StorageModule = typeof import('./storage');

function loadStorage(env: Record<string, string>): StorageModule {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  let mod!: StorageModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./storage') as StorageModule;
  });
  process.env = saved;
  return mod;
}

const CLOUD_ENV = {
  CLOUDINARY_CLOUD_NAME: 'sarh',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  CLOUDINARY_FOLDER: 'safat',
  STORAGE_PROVIDER: 'cloudinary',
};

describe('protected chat upload slots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('signs type=authenticated in a per-uploader folder when requested', async () => {
    const storage = loadStorage(CLOUD_ENV);
    const slot = await storage.getPresignedUploadUrl(
      'messages',
      'audio/mp4',
      300,
      {
        userId: 'u1',
        protectedDelivery: true,
      },
    );
    expect(slot).toMatchObject({
      provider: 'cloudinary',
      type: 'authenticated',
      folder: 'safat/messages/u1',
    });
    expect(mockApiSignRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'authenticated',
        folder: 'safat/messages/u1',
      }),
      'secret',
    );
  });

  it('keeps the legacy signed params for old clients (no type)', async () => {
    const storage = loadStorage(CLOUD_ENV);
    const slot = await storage.getPresignedUploadUrl('messages', 'image/jpeg');
    expect(slot).not.toHaveProperty('type');
    expect(slot).toMatchObject({ folder: 'safat/messages' });
    const signed = (mockApiSignRequest.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(signed).sort()).toEqual([
      'folder',
      'public_id',
      'timestamp',
    ]);
  });

  it('builds signed delivery URLs (optionally token-based)', () => {
    const storage = loadStorage({
      ...CLOUD_ENV,
      CLOUDINARY_AUTH_TOKEN_KEY: 'abcd',
    });
    storage.signedCloudinaryDeliveryUrl({
      publicId: 'safat/messages/u1/a',
      resourceType: 'video',
      deliveryType: 'authenticated',
      version: '17',
      format: 'm4a',
    });
    expect(mockCloudinaryUrl).toHaveBeenCalledWith(
      'safat/messages/u1/a',
      expect.objectContaining({
        type: 'authenticated',
        sign_url: true,
        resource_type: 'video',
        auth_token: expect.objectContaining({ key: 'abcd' }),
      }),
    );
  });
});
