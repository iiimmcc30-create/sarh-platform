import { SaudiCitiesService } from '../geo/saudi-cities.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PostsService } from '../posts/posts.service';
import { ListingsService } from '../listings/listings.service';

describe('profile counts after a delete', () => {
  it('counts only live (not soft-deleted) posts in the profile select', () => {
    const repo = readFileSync(
      join(__dirname, 'repositories', 'users.repository.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const start = repo.indexOf('const profileSelect = {');
    const end = repo.indexOf('} satisfies Prisma.UserSelect;', start);
    const block = repo.slice(start, end);
    expect(block).toContain('posts: { where: { deletedAt: null } }');
    expect(block).not.toMatch(/posts: true/);
  });

  it('drops only the author profile cache when a post is deleted', async () => {
    const repo = {
      findOwnerMeta: jest
        .fn()
        .mockResolvedValue({ id: 'p1', authorId: 'author-1' }),
      softDelete: jest.fn().mockResolvedValue({}),
    };
    const cache = {
      del: jest.fn(),
      keys: { post: (id: string) => `post:${id}` },
    };
    const service = new PostsService(
      repo as never,
      {} as never,
      cache as never,
      {} as never,
    );

    await service.deletePost(
      { userId: 'author-1', username: 'a', role: 'USER' },
      'p1',
    );

    expect(repo.softDelete).toHaveBeenCalledWith('p1');
    expect(cache.del).toHaveBeenCalledWith(
      'user:author-1',
      'user:author-1:base',
    );
    const keys = cache.del.mock.calls.flat();
    expect(keys.filter((k: string) => k.startsWith('user:'))).toEqual([
      'user:author-1',
      'user:author-1:base',
    ]);
  });

  it('does not touch profile caches when the delete is refused', async () => {
    const repo = {
      findOwnerMeta: jest
        .fn()
        .mockResolvedValue({ id: 'p1', authorId: 'author-1' }),
      softDelete: jest.fn(),
    };
    const cache = {
      del: jest.fn(),
      keys: { post: (id: string) => `post:${id}` },
    };
    const service = new PostsService(
      repo as never,
      {} as never,
      cache as never,
      {} as never,
    );

    await expect(
      service.deletePost(
        { userId: 'someone-else', username: 's', role: 'USER' },
        'p1',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('drops only the seller profile cache when a listing is deleted', async () => {
    const repo = {
      findSellerId: jest.fn().mockResolvedValue({ sellerId: 'seller-1' }),
      softDelete: jest.fn().mockResolvedValue({}),
    };
    const cache = {
      del: jest.fn(),
      delPattern: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const service = new ListingsService(
      repo as never,
      {} as never,
      cache as never,
      logger as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new SaudiCitiesService({} as never),
    );

    await service.remove(
      { userId: 'seller-1', username: 's', role: 'USER' },
      'l1',
      {
        sold: false,
        reason: 'لم يعد متاحاً',
      },
    );

    expect(cache.del).toHaveBeenCalledWith(
      'user:seller-1',
      'user:seller-1:base',
    );
  });
});
