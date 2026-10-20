import { readFileSync } from 'fs';
import { join } from 'path';
import { commentToneWhere } from '../lib/review-stats';
import { UsersRepository } from './users.repository';

describe('UsersRepository reviews', () => {
  const userReview = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({
      _avg: { rating: null },
      _count: { rating: 0 },
    }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  };
  const repo = new UsersRepository({ userReview } as never);

  it('lists only visible reviews and pages with a cursor', async () => {
    await repo.listVisibleReviews('target-1', { cursor: 'rev-9', take: 16 });
    expect(userReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetId: 'target-1', hiddenAt: null },
        take: 16,
        skip: 1,
        cursor: { id: 'rev-9' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('counts full reviews by recommend and legacy stars by rating', async () => {
    await repo.reviewStats('target-1');
    expect(userReview.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetId: 'target-1', hiddenAt: null },
      }),
    );
    expect(userReview.count).toHaveBeenCalledWith({
      where: commentToneWhere('target-1', true),
    });
    expect(userReview.count).toHaveBeenCalledWith({
      where: commentToneWhere('target-1', false),
    });
  });

  it('creates reviews and does not expose an edit or delete', () => {
    const source = readFileSync(join(__dirname, 'users.repository.ts'), 'utf8');
    expect(source).toContain('userReview.create');
    expect(source).not.toContain('userReview.update');
    expect(source).not.toContain('userReview.delete');
    expect(source).not.toContain('userReview.upsert');
    expect(userReview.update).not.toHaveBeenCalled();
    expect(userReview.delete).not.toHaveBeenCalled();
  });
});
