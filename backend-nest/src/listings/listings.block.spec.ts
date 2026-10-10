import { SaudiCitiesService } from '../geo/saudi-cities.service';
import { ListingsService } from './listings.service';

/** Two-way block (Apple 1.2): listing detail, comments list and commenting. */
describe('ListingsService block enforcement', () => {
  const listing = { id: 'l1', sellerId: 'seller', arabicTitle: 'إعلان' };
  const repo = {
    findById: jest.fn().mockResolvedValue(listing),
    incrementViews: jest.fn().mockResolvedValue(undefined),
    findActiveListingMeta: jest.fn().mockResolvedValue(listing),
    findComments: jest.fn().mockResolvedValue([
      { id: 'c1', authorId: 'friend', parentId: null },
      { id: 'c2', authorId: 'blockedGuy', parentId: null },
      { id: 'r1', authorId: 'friend', parentId: 'c2' },
    ]),
    createComment: jest.fn(),
  };
  const usersRepo = { findBlockedRelationshipIds: jest.fn() };
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn(),
  };
  const promotions = {
    expireStalePromotions: jest.fn().mockResolvedValue(undefined),
    trackPromotionEvent: jest.fn(),
  };
  const service = new ListingsService(
    repo as never,
    usersRepo as never,
    cache as never,
    { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    {} as never,
    { notifyUser: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    promotions as never,
    {} as never,
    {} as never,
    new SaudiCitiesService({} as never),
  );
  const viewer = { userId: 'me', username: 'me', role: 'USER' as const };

  beforeEach(() => jest.clearAllMocks());

  it('403s the listing detail when the seller and viewer are in a block pair', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['seller']);
    await expect(service.getById('l1', viewer)).rejects.toMatchObject({
      status: 403,
      error: 'blocked',
    });
    expect(repo.incrementViews).not.toHaveBeenCalled();
  });

  it('also 403s from the Redis copy', async () => {
    cache.get.mockResolvedValueOnce({ ...listing });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['seller']);
    await expect(service.getById('l1', viewer)).rejects.toMatchObject({
      error: 'blocked',
    });
  });

  it('serves the listing to guests and unblocked viewers', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    await expect(service.getById('l1', viewer)).resolves.toMatchObject({
      id: 'l1',
    });
    await expect(service.getById('l1')).resolves.toMatchObject({ id: 'l1' });
  });

  it('blocks commenting on a blocked seller’s listing', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['seller']);
    await expect(
      service.createComment(viewer, 'l1', { content: 'مرحبا' } as never),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
    expect(repo.createComment).not.toHaveBeenCalled();
  });

  it('hides comments (and replies under them) by blocked accounts', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['blockedGuy']);
    const { comments } = await service.listComments('l1', viewer);
    expect(comments.map((c) => c.id)).toEqual(['c1']);
  });
});
