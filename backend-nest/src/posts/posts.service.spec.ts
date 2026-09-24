import { PostsService } from './posts.service';

function post(id: string, authorId: string) {
  return {
    id,
    authorId,
    content: 'x',
    arabicContent: 'س',
    author: { id: authorId },
    _count: { likes: 0, reposts: 0, comments: 0 },
  };
}

describe('PostsService feed cache isolation', () => {
  const repo = {
    findFeed: jest.fn(),
    findFollowingIds: jest.fn(),
    findLikesByUser: jest.fn(),
    findRepostsByUser: jest.fn(),
    findBookmarksByUser: jest.fn(),
    findById: jest.fn(),
    incrementViewsCount: jest.fn().mockResolvedValue({ viewsCount: 1 }),
    create: jest.fn(),
    findFollowerIds: jest.fn().mockResolvedValue([]),
    findLike: jest.fn(),
    findRepost: jest.fn(),
    findBookmark: jest.fn(),
    findOwnerMeta: jest.fn(),
    toggleLike: jest.fn(),
    toggleRepost: jest.fn(),
    toggleBookmark: jest.fn(),
    createComment: jest.fn(),
  };
  const usersRepo = {
    findBlockedRelationshipIds: jest.fn(),
    findUserCommentsAudience: jest.fn(),
    findFollow: jest.fn(),
  };
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn().mockResolvedValue(0),
    keys: { post: (id: string) => `post:${id}` },
  };
  const notifications = { notifyUsers: jest.fn() };

  let service: PostsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PostsService(
      repo as never,
      usersRepo as never,
      cache as never,
      notifications as never,
    );
  });

  it("does not return another viewer's liked flags from a shared cache entry", async () => {
    cache.get.mockResolvedValue({
      posts: [post('p1', 'author-1')],
      nextCursor: null,
      hasMore: false,
    });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLikesByUser.mockResolvedValue([]);
    repo.findRepostsByUser.mockResolvedValue([]);
    repo.findBookmarksByUser.mockResolvedValue([]);

    const result = await service.getFeed(
      {},
      {
        userId: 'viewer-b',
        username: 'b',
        role: 'USER',
      },
    );

    expect(result.posts[0].liked).toBe(false);
    expect(repo.findLikesByUser).toHaveBeenCalledWith('viewer-b', ['p1']);
  });

  it('filters blocked authors on a cache hit', async () => {
    cache.get.mockResolvedValue({
      posts: [post('p1', 'blocked-user'), post('p2', 'ok-user')],
      nextCursor: null,
      hasMore: false,
    });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['blocked-user']);
    repo.findLikesByUser.mockResolvedValue([]);
    repo.findRepostsByUser.mockResolvedValue([]);
    repo.findBookmarksByUser.mockResolvedValue([]);

    const result = await service.getFeed(
      {},
      {
        userId: 'viewer-a',
        username: 'a',
        role: 'USER',
      },
    );

    expect(result.posts.map((p) => p.id)).toEqual(['p2']);
  });

  it('stores raw posts without liked metadata', async () => {
    cache.get.mockResolvedValue(null);
    repo.findFeed.mockResolvedValue([post('p1', 'author-1')]);
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLikesByUser.mockResolvedValue([{ postId: 'p1' }]);
    repo.findRepostsByUser.mockResolvedValue([]);
    repo.findBookmarksByUser.mockResolvedValue([]);

    await service.getFeed(
      {},
      {
        userId: 'viewer-a',
        username: 'a',
        role: 'USER',
      },
    );

    expect(cache.set).toHaveBeenCalled();
    const stored = cache.set.mock.calls[0][1] as {
      posts: Array<{ liked?: boolean }>;
    };
    expect(stored.posts[0].liked).toBeUndefined();
  });

  it('hides a post from a viewer who blocked the author', async () => {
    repo.findById.mockResolvedValue(post('p1', 'blocked-user'));
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['blocked-user']);

    await expect(
      service.getPost('p1', {
        userId: 'viewer-a',
        username: 'a',
        role: 'USER',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
    expect(repo.incrementViewsCount).not.toHaveBeenCalled();
  });

  it('creates a post with image and video PostMedia in order', async () => {
    repo.create.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'p-new',
      authorId: 'author-1',
      content: data.content,
      arabicContent: data.arabicContent,
      image: data.image,
      images: data.images,
      media: (
        data.media as {
          create: Array<{ url: string; type: string; sortOrder: number }>;
        }
      )?.create,
      author: { id: 'author-1' },
    }));

    const created = await service.createPost(
      { userId: 'author-1', username: 'a', role: 'USER' },
      {
        content: 'hello',
        arabicContent: 'مرحبا',
        media: [
          { url: 'https://cdn.example/a.jpg', type: 'IMAGE', sortOrder: 0 },
          {
            url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
            type: 'VIDEO',
            sortOrder: 1,
          },
        ],
      },
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ['https://cdn.example/a.jpg'],
        image: 'https://cdn.example/a.jpg',
        media: {
          create: [
            { url: 'https://cdn.example/a.jpg', type: 'IMAGE', sortOrder: 0 },
            {
              url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
              type: 'VIDEO',
              sortOrder: 1,
            },
          ],
        },
      }),
    );
    expect(created.media.map((item: { type: string }) => item.type)).toEqual([
      'IMAGE',
      'VIDEO',
    ]);
    expect(created.video).toContain('/video/upload/');
  });

  it('increments views when a post is opened', async () => {
    repo.findById.mockResolvedValue({
      ...post('p1', 'author-1'),
      viewsCount: 4,
    });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLike.mockResolvedValue(null);
    repo.findRepost.mockResolvedValue(null);
    repo.findBookmark.mockResolvedValue(null);

    const result = await service.getPost('p1', {
      userId: 'viewer-a',
      username: 'a',
      role: 'USER',
    });

    expect(repo.incrementViewsCount).toHaveBeenCalledWith('p1');
    expect(result.viewsCount).toBe(5);
  });
});

describe('PostsService block enforcement on mutations (H5)', () => {
  const repo = {
    findOwnerMeta: jest.fn(),
    findLike: jest.fn(),
    findRepost: jest.fn(),
    findBookmark: jest.fn(),
    toggleLike: jest.fn(),
    toggleRepost: jest.fn(),
    toggleBookmark: jest.fn(),
    incrementViewsCount: jest.fn().mockResolvedValue({ viewsCount: 8 }),
    findById: jest.fn(),
    createComment: jest.fn(),
  };
  const usersRepo = {
    findBlockedRelationshipIds: jest.fn(),
    findUserCommentsAudience: jest.fn(),
    findFollow: jest.fn(),
  };
  const cache = {
    del: jest.fn(),
    keys: { post: (id: string) => `post:${id}` },
  };
  const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const viewer = { userId: 'user-b', username: 'b', role: 'USER' as const };

  let service: PostsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOwnerMeta.mockResolvedValue({ id: 'p1', authorId: 'user-a' });
    service = new PostsService(
      repo as never,
      usersRepo as never,
      cache as never,
      notifications as never,
    );
  });

  it("rejects like when A blocked B (B cannot like A's post)", async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-a']);
    await expect(service.toggleLike(viewer, 'p1')).rejects.toMatchObject({
      status: 403,
      error: 'blocked',
    });
    expect(repo.toggleLike).not.toHaveBeenCalled();
    expect(repo.findLike).not.toHaveBeenCalled();
  });

  it('rejects comment when blocked', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-a']);
    await expect(
      service.createComment(viewer, 'p1', { content: 'hi' }),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
    expect(repo.createComment).not.toHaveBeenCalled();
  });

  it('rejects repost when blocked', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-a']);
    await expect(service.toggleRepost(viewer, 'p1')).rejects.toMatchObject({
      status: 403,
      error: 'blocked',
    });
    expect(repo.toggleRepost).not.toHaveBeenCalled();
  });

  it('applies the same bidirectional block set used by getPost', async () => {
    repo.findOwnerMeta.mockResolvedValue({ id: 'p1', authorId: 'user-b' });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-b']);
    await expect(
      service.toggleLike(
        { userId: 'user-a', username: 'a', role: 'USER' },
        'p1',
      ),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
  });

  it('allows a non-blocked user to like, comment, and repost', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLike.mockResolvedValue(null);
    repo.toggleLike.mockResolvedValue(true);
    repo.findRepost.mockResolvedValue(null);
    repo.toggleRepost.mockResolvedValue(true);
    repo.createComment.mockResolvedValue({ id: 'c1' });
    usersRepo.findUserCommentsAudience.mockResolvedValue({
      commentsAudience: 'everyone',
    });

    await expect(service.toggleLike(viewer, 'p1')).resolves.toEqual({
      liked: true,
    });
    await expect(
      service.createComment(viewer, 'p1', { content: 'nice' }),
    ).resolves.toMatchObject({ id: 'c1' });
    await expect(service.toggleRepost(viewer, 'p1')).resolves.toEqual({
      reposted: true,
    });
    repo.findBookmark.mockResolvedValue(null);
    repo.toggleBookmark.mockResolvedValue(true);
    await expect(service.toggleBookmark(viewer, 'p1')).resolves.toEqual({
      bookmarked: true,
    });
  });

  it('rejects bookmark when blocked', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-a']);
    await expect(service.toggleBookmark(viewer, 'p1')).rejects.toMatchObject({
      status: 403,
      error: 'blocked',
    });
    expect(repo.toggleBookmark).not.toHaveBeenCalled();
  });

  it('records a view via incrementViewsCount and skips the author', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    await expect(service.recordView('p1', viewer)).resolves.toEqual({
      recorded: true,
      viewsCount: 8,
    });
    expect(repo.incrementViewsCount).toHaveBeenCalledWith('p1');

    repo.findById.mockResolvedValue({ viewsCount: 8 });
    await expect(
      service.recordView('p1', {
        userId: 'user-a',
        username: 'a',
        role: 'USER',
      }),
    ).resolves.toEqual({ recorded: false, viewsCount: 8 });
  });

  it('does not delete existing likes or comments when a later block rejects a mutation', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue(['user-a']);
    await expect(service.toggleLike(viewer, 'p1')).rejects.toMatchObject({
      error: 'blocked',
    });
    expect(repo.toggleLike).not.toHaveBeenCalled();
    expect(repo.createComment).not.toHaveBeenCalled();
  });
});
