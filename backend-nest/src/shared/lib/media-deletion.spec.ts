import {
  processMediaDeletionBatch,
  resolveMediaDeletionTarget,
  type MediaDeletionStore,
} from './media-deletion';
import { destroyCloudinaryAsset } from './storage';

jest.mock('./storage', () => {
  const actual = jest.requireActual('./storage') as Record<string, unknown>;
  return {
    ...actual,
    getCloudinaryCloudName: () => 'sarhcloud',
    getCloudinaryBaseFolder: () => 'sarh',
    getStorageProvider: () => 'cloudinary',
    destroyCloudinaryAsset: jest.fn(),
  };
});

const destroy = destroyCloudinaryAsset as jest.Mock;
const OURS =
  'https://res.cloudinary.com/sarhcloud/image/upload/v17/sarh/listings/u1/a1.jpg';

function store(rows: Array<{ id: string; url: string; attempts?: number }>) {
  const s: MediaDeletionStore & {
    done: Array<[string, string | undefined]>;
    failed: Array<[string, string]>;
  } = {
    done: [],
    failed: [],
    findPending: jest.fn(async () => rows.map((r) => ({ attempts: 0, ...r }))),
    markDone: jest.fn(async (id: string, note?: string) => {
      s.done.push([id, note]);
    }),
    markFailed: jest.fn(async (id: string, err: string) => {
      s.failed.push([id, err]);
    }),
  };
  return s;
}

describe('media deletion queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('targets only our cloud + base folder', () => {
    expect(resolveMediaDeletionTarget(OURS)).toEqual({
      kind: 'cloudinary',
      ref: expect.objectContaining({
        publicId: 'sarh/listings/u1/a1',
        resourceType: 'image',
        deliveryType: 'upload',
      }),
    });
    expect(
      resolveMediaDeletionTarget(
        'https://res.cloudinary.com/other/image/upload/v1/sarh/x.jpg',
      ),
    ).toMatchObject({ kind: 'skip', reason: 'foreign_cloud' });
    expect(
      resolveMediaDeletionTarget(
        'https://res.cloudinary.com/sarhcloud/image/upload/v1/elsewhere/x.jpg',
      ),
    ).toMatchObject({ kind: 'skip' });
    expect(
      resolveMediaDeletionTarget('https://images.unsplash.com/seed.jpg'),
    ).toMatchObject({ kind: 'skip', reason: 'not_our_storage' });
  });

  it('deletes ours, skips foreign, records failures for retry', async () => {
    destroy
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rate limited'));
    const s = store([
      { id: 'j1', url: OURS },
      { id: 'j2', url: 'https://images.unsplash.com/seed.jpg' },
      { id: 'j3', url: OURS.replace('a1', 'a2') },
    ]);
    const result = await processMediaDeletionBatch(s, 10);
    expect(result).toEqual({ deleted: 1, skipped: 1, failed: 1 });
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(s.done).toEqual([
      ['j1', undefined],
      ['j2', 'skipped:not_our_storage'],
    ]);
    expect(s.failed).toEqual([['j3', 'rate limited']]);
  });
});
