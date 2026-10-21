import { Prisma } from '@prisma/client';
import { UserReviewsService } from './user-reviews.service';
import type { CreateUserReviewDto } from '../dto/user-reviews.dto';

const target = {
  id: 'target-1',
  username: 'shop',
  displayName: 'Shop',
  arabicName: 'دكان مزاد',
  avatar: null,
};

function validDto(
  overrides: Partial<CreateUserReviewDto> = {},
): CreateUserReviewDto {
  return {
    rating: 5,
    purchased: true,
    recommend: true,
    comment: 'تعامل ممتاز',
    oathAccepted: true,
    ...overrides,
  };
}

function makeService() {
  const repo = {
    findReviewTarget: jest.fn().mockResolvedValue(target),
    findActiveUserId: jest.fn().mockResolvedValue({ id: target.id }),
    findBlock: jest.fn().mockResolvedValue(null),
    findReviewByPair: jest.fn().mockResolvedValue(null),
    findReviewById: jest.fn(),
    createUserReview: jest.fn().mockResolvedValue({ id: 'rev-1' }),
    listVisibleReviews: jest.fn().mockResolvedValue([]),
    reviewStats: jest.fn().mockResolvedValue({
      average: 5,
      reviewCount: 1,
      positiveCount: 1,
      negativeCount: 0,
    }),
    recomputeRatingCache: jest.fn().mockResolvedValue({
      rating: 5,
      reviewCount: 1,
    }),
  };
  const reports = { create: jest.fn().mockResolvedValue({ id: 'ticket-1' }) };
  const redis = { cacheDel: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const limiter = { assert: jest.fn() };
  const service = new UserReviewsService(
    repo as never,
    reports as never,
    redis as never,
    logger as never,
    limiter as never,
  );
  return { service, repo, reports, redis, limiter };
}

describe('UserReviewsService.create immutability and validation', () => {
  it('inserts once and refreshes the rating cache', async () => {
    const { service, repo, redis, limiter } = makeService();
    const result = await service.create('target-1', 'reviewer-1', validDto());
    expect(limiter.assert).toHaveBeenCalledWith('reviewer-1');
    expect(repo.createUserReview).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'target-1',
        reviewerId: 'reviewer-1',
        rating: 5,
        purchased: true,
        recommend: true,
        comment: 'تعامل ممتاز',
      }),
    );
    expect(repo.recomputeRatingCache).toHaveBeenCalledWith('target-1');
    expect(redis.cacheDel).toHaveBeenCalledWith(
      'user:target-1',
      'user:target-1:base',
    );
    expect(result).toEqual({ rating: 5, reviewCount: 1, created: true });
  });

  it('rejects a second review instead of updating', async () => {
    const { service, repo } = makeService();
    repo.findReviewByPair.mockResolvedValue({ id: 'rev-1' });
    await expect(
      service.create('target-1', 'reviewer-1', validDto({ rating: 1 })),
    ).rejects.toMatchObject({ status: 409, error: 'already_reviewed' });
    expect(repo.createUserReview).not.toHaveBeenCalled();
  });

  it('maps a unique-constraint race to the same conflict', async () => {
    const { service, repo } = makeService();
    repo.createUserReview.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create('target-1', 'reviewer-1', validDto()),
    ).rejects.toMatchObject({ status: 409, error: 'already_reviewed' });
  });

  it('has no update or delete operation', () => {
    expect(UserReviewsService.prototype).not.toHaveProperty('updateReview');
    expect(UserReviewsService.prototype).not.toHaveProperty('deleteReview');
    expect(UserReviewsService.prototype).not.toHaveProperty('rateUser');
  });

  it.each([
    [validDto({ oathAccepted: false as unknown as true }), 'oath_required'],
    [validDto({ comment: '   ' }), 'validation_error'],
    [validDto({ comment: 'ا'.repeat(1001) }), 'validation_error'],
    [validDto({ rating: 0 }), 'invalid_rating'],
    [validDto({ rating: 6 }), 'invalid_rating'],
  ])('rejects invalid payload %#', async (dto, error) => {
    const { service, repo } = makeService();
    await expect(
      service.create('target-1', 'reviewer-1', dto),
    ).rejects.toMatchObject({ status: 400, error });
    expect(repo.createUserReview).not.toHaveBeenCalled();
  });

  it('rejects a self review and a blocked pair', async () => {
    const { service, repo } = makeService();
    await expect(
      service.create('target-1', 'target-1', validDto()),
    ).rejects.toMatchObject({ status: 400, error: 'invalid_action' });

    repo.findBlock.mockResolvedValueOnce({ id: 'block-1' });
    await expect(
      service.create('target-1', 'reviewer-1', validDto()),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
    expect(repo.createUserReview).not.toHaveBeenCalled();
  });

  it('stops when the create budget is exhausted', async () => {
    const { service, repo, limiter } = makeService();
    limiter.assert.mockImplementation(() => {
      const err = new Error('limit');
      Object.assign(err, { status: 429, error: 'rate_limited' });
      throw err;
    });
    await expect(
      service.create('target-1', 'reviewer-1', validDto()),
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.createUserReview).not.toHaveBeenCalled();
  });
});

describe('UserReviewsService.list', () => {
  it('paginates with an extra row and returns counts from visible stats', async () => {
    const { service, repo } = makeService();
    repo.listVisibleReviews.mockResolvedValue([
      reviewRow('r1'),
      reviewRow('r2'),
      reviewRow('r3'),
    ]);
    repo.reviewStats.mockResolvedValue({
      average: 4,
      reviewCount: 3,
      positiveCount: 2,
      negativeCount: 1,
    });
    const page = await service.list(
      'target-1',
      { limit: 2 },
      {
        userId: 'viewer-1',
        username: 'v',
        role: 'USER',
      },
    );
    expect(repo.listVisibleReviews).toHaveBeenCalledWith('target-1', {
      cursor: undefined,
      take: 3,
    });
    expect(page.reviews.map((row) => row.id)).toEqual(['r1', 'r2']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('r2');
    expect(page.positiveCount).toBe(2);
    expect(page.negativeCount).toBe(1);
    expect(page.average).toBe(4);
    expect(page.reviewCount).toBe(3);
  });

  it('requests the following page from the cursor', async () => {
    const { service, repo } = makeService();
    repo.listVisibleReviews.mockResolvedValue([reviewRow('r3')]);
    const page = await service.list('target-1', { cursor: 'r2', limit: 2 });
    expect(repo.listVisibleReviews).toHaveBeenCalledWith('target-1', {
      cursor: 'r2',
      take: 3,
    });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.reviews).toHaveLength(1);
  });

  it('hides the list when the target blocked the viewer', async () => {
    const { service, repo } = makeService();
    repo.findBlock.mockResolvedValue({ id: 'block' });
    await expect(
      service.list(
        'target-1',
        {},
        { userId: 'viewer-1', username: 'v', role: 'USER' },
      ),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
    expect(repo.listVisibleReviews).not.toHaveBeenCalled();
  });
});

describe('UserReviewsService.report', () => {
  it('opens a report ticket and refuses the author', async () => {
    const { service, repo, reports } = makeService();
    repo.findReviewById.mockResolvedValue({
      id: 'rev-1',
      targetId: 'target-1',
      reviewerId: 'someone',
      hiddenAt: null,
    });
    await service.report(
      'target-1',
      'rev-1',
      { userId: 'viewer-1', username: 'v', role: 'USER' },
      { reason: 'احتيال' },
    );
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'viewer-1' }),
      expect.objectContaining({ targetType: 'review', targetId: 'rev-1' }),
    );

    await expect(
      service.report(
        'target-1',
        'rev-1',
        { userId: 'someone', username: 's', role: 'USER' },
        { reason: 'احتيال' },
      ),
    ).rejects.toMatchObject({ status: 400, error: 'invalid_action' });
  });
});

function reviewRow(id: string) {
  return {
    id,
    rating: 5,
    comment: 'نص',
    purchased: true,
    recommend: true,
    oathAcceptedAt: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    reviewer: {
      id: `user-${id}`,
      username: id,
      displayName: id,
      arabicName: id,
      avatar: null,
    },
  };
}
