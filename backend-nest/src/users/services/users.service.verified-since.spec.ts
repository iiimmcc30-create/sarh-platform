import { UsersService } from './users.service';

describe('UsersService.getUser verifiedSince', () => {
  const baseRow = {
    id: 'u1',
    username: 'ahmed',
    displayName: 'Ahmed',
    arabicName: 'Ahmed',
    avatar: null,
    coverImage: null,
    bio: null,
    verified: true,
    verifiedTier: 'blue',
    isAI: false,
    country: 'SA',
    role: 'USER',
    rating: 0,
    reviewCount: 0,
    showInSearch: true,
    allowPrivateMessages: true,
    showFollowingList: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSeenAt: null,
    _count: { followers: 1, following: 2, listings: 0, posts: 3 },
  };

  function makeService(row: Record<string, unknown>) {
    const repo = {
      findUserProfile: jest.fn().mockResolvedValue(row),
      findBlock: jest.fn().mockResolvedValue(null),
      findFollow: jest.fn().mockResolvedValue(null),
      findUserRating: jest.fn().mockResolvedValue(null),
    };
    const redis = { cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn() };
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return new UsersService(repo as never, redis as never, logger as never, {} as never, {} as never, {} as never);
  }

  it('exposes the approval date on the public profile', async () => {
    const service = makeService({
      ...baseRow,
      accountVerificationRequest: { status: 'VERIFIED', reviewedAt: new Date('2025-03-14T09:30:00.000Z') },
    });
    const profile = (await service.getUser('u1')) as Record<string, unknown>;
    expect(profile.verifiedSince).toBe('2025-03-14T09:30:00.000Z');
    expect(profile).not.toHaveProperty('accountVerificationRequest');
  });

  it('is null for a badge without an approved request', async () => {
    const service = makeService({ ...baseRow, accountVerificationRequest: null });
    const profile = (await service.getUser('u1')) as Record<string, unknown>;
    expect(profile.verifiedSince).toBeNull();
  });
});
