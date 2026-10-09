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
    findCommentsByAuthor: jest.fn(),
    findRepostsForUser: jest.fn(),
    findLikesForUser: jest.fn(),
  };
  const usersRepo = {
    findBlockedRelationshipIds: jest.fn(),
    findMutedUserIds: jest.fn().mockResolvedValue([]),
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

  it('hides muted authors from the home feed', async () => {
    cache.get.mockResolvedValue({
      posts: [post('p1', 'muted-user'), post('p2', 'ok-user')],
      nextCursor: null,
      hasMore: false,
    });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    usersRepo.findMutedUserIds.mockResolvedValueOnce(['muted-user']);
    repo.findLikesByUser.mockResolvedValue([]);
    repo.findRepostsByUser.mockResolvedValue([]);
    repo.findBookmarksByUser.mockResolvedValue([]);

    const result = await service.getFeed(
      {},
      { userId: 'viewer-m', username: 'm', role: 'USER' },
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

  it('does not leak another user likes list', async () => {
    const result = await service.getFeed(
      { userId: 'author-1', activity: 'likes' },
      { userId: 'viewer-b', username: 'b', role: 'USER' },
    );
    expect(result).toEqual({ posts: [], nextCursor: null, hasMore: false });
    expect(repo.findLikesForUser).not.toHaveBeenCalled();
  });

  it('returns profile replies from existing comments', async () => {
    repo.findCommentsByAuthor.mockResolvedValue([
      {
        id: 'c1',
        content: 'رد',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        authorId: 'author-1',
        author: { id: 'author-1', username: 'a', arabicName: 'أ' },
        post: {
          id: 'p1',
          authorId: 'owner-1',
          author: { id: 'owner-1', username: 'owner', arabicName: 'محمد' },
        },
      },
    ]);
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);

    const result = await service.getFeed(
      { userId: 'author-1', activity: 'replies' },
      { userId: 'viewer-a', username: 'a', role: 'USER' },
    );

    expect(repo.findCommentsByAuthor).toHaveBeenCalledWith({
      authorId: 'author-1',
      take: 21,
      cursor: undefined,
    });
    expect(result).toMatchObject({
      hasMore: false,
      replies: [
        {
          id: 'c1',
          content: 'رد',
          postId: 'p1',
          originalAuthor: { username: 'owner', arabicName: 'محمد' },
        },
      ],
    });
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

  it('accepts a media-only post and rejects a post with neither text nor media', async () => {
    repo.create.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'p-media',
      authorId: 'author-1',
      content: data.content,
      arabicContent: data.arabicContent,
      media: [],
      author: { id: 'author-1' },
    }));
    const author = { userId: 'author-1', username: 'a', role: 'USER' as const };

    await expect(
      service.createPost(author, {
        content: '',
        arabicContent: '',
        media: [{ url: 'https://cdn.example/only.jpg', type: 'IMAGE', sortOrder: 0 }],
      }),
    ).resolves.toMatchObject({ id: 'p-media' });

    repo.create.mockClear();
    await expect(
      service.createPost(author, { content: '  ', arabicContent: '' }),
    ).rejects.toMatchObject({ status: 400, error: 'empty_post' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not count a view when a post is fetched (detail refetch after a like)', async () => {
    repo.findById.mockResolvedValue({
      ...post('p1', 'author-1'),
      viewsCount: 4,
    });
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLike.mockResolvedValue({ id: 'l1' });
    repo.findRepost.mockResolvedValue(null);
    repo.findBookmark.mockResolvedValue(null);

    const viewer = { userId: 'viewer-a', username: 'a', role: 'USER' as const };
    const first = await service.getPost('p1', viewer);
    const second = await service.getPost('p1', viewer);

    expect(repo.incrementViewsCount).not.toHaveBeenCalled();
    expect(first.viewsCount).toBe(4);
    expect(second.viewsCount).toBe(4);
    expect(second.liked).toBe(true);
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
    findViewsCount: jest.fn().mockResolvedValue({ viewsCount: 8 }),
    countLikes: jest.fn().mockResolvedValue(3),
    findById: jest.fn(),
    createComment: jest.fn(),
  };
  const usersRepo = {
    findBlockedRelationshipIds: jest.fn(),
    findMutedUserIds: jest.fn().mockResolvedValue([]),
    findUserCommentsAudience: jest.fn(),
    findFollow: jest.fn(),
  };
  const cache = {
    del: jest.fn(),
    claimOnce: jest.fn().mockResolvedValue(true),
    keys: { post: (id: string) => `post:${id}` },
  };
  const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const viewer = { userId: 'user-b', username: 'b', role: 'USER' as const };

  let service: PostsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOwnerMeta.mockResolvedValue({ id: 'p1', authorId: 'user-a' });
    repo.findViewsCount.mockResolvedValue({ viewsCount: 8 });
    repo.countLikes.mockResolvedValue(3);
    cache.claimOnce.mockResolvedValue(true);
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
      likesCount: 3,
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
    expect(cache.claimOnce).toHaveBeenCalledWith(
      'posts:view:p1:u:user-b',
      24 * 60 * 60,
    );

    repo.incrementViewsCount.mockClear();
    await expect(
      service.recordView('p1', {
        userId: 'user-a',
        username: 'a',
        role: 'USER',
      }),
    ).resolves.toEqual({ recorded: false, viewsCount: 8 });
    expect(repo.incrementViewsCount).not.toHaveBeenCalled();
  });

  it('counts a view only once per viewer and post inside the dedupe window', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    const claimed = new Set<string>();
    cache.claimOnce.mockImplementation(async (key: string) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    });

    await expect(service.recordView('p1', viewer)).resolves.toMatchObject({
      recorded: true,
    });
    await expect(service.recordView('p1', viewer)).resolves.toEqual({
      recorded: false,
      viewsCount: 8,
    });
    await expect(service.recordView('p1', viewer)).resolves.toMatchObject({
      recorded: false,
    });
    expect(repo.incrementViewsCount).toHaveBeenCalledTimes(1);

    // A different viewer still counts.
    await expect(
      service.recordView('p1', { userId: 'user-c', username: 'c', role: 'USER' }),
    ).resolves.toMatchObject({ recorded: true });
    expect(repo.incrementViewsCount).toHaveBeenCalledTimes(2);
  });

  it('dedupes guest views by the anonymous viewer key', async () => {
    const claimed = new Set<string>();
    cache.claimOnce.mockImplementation(async (key: string) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    });
    await service.recordView('p1', undefined, 'guest-hash');
    await service.recordView('p1', undefined, 'guest-hash');
    expect(cache.claimOnce).toHaveBeenCalledWith(
      'posts:view:p1:a:guest-hash',
      24 * 60 * 60,
    );
    expect(repo.incrementViewsCount).toHaveBeenCalledTimes(1);
  });

  it('never counts a view when liking, reposting, or bookmarking', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLike.mockResolvedValue(null);
    repo.toggleLike.mockResolvedValue(true);
    repo.findRepost.mockResolvedValue(null);
    repo.toggleRepost.mockResolvedValue(true);
    repo.findBookmark.mockResolvedValue(null);
    repo.toggleBookmark.mockResolvedValue(true);

    await service.toggleLike(viewer, 'p1');
    await service.toggleRepost(viewer, 'p1');
    await service.toggleBookmark(viewer, 'p1');

    expect(repo.incrementViewsCount).not.toHaveBeenCalled();
    expect(cache.claimOnce).not.toHaveBeenCalled();
  });

  it('unlikes on the second toggle and returns the real like count', async () => {
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    repo.findLike.mockResolvedValueOnce(null);
    repo.toggleLike.mockResolvedValueOnce(true);
    repo.countLikes.mockResolvedValueOnce(4);
    await expect(service.toggleLike(viewer, 'p1')).resolves.toEqual({
      liked: true,
      likesCount: 4,
    });

    repo.findLike.mockResolvedValueOnce({ id: 'l1' });
    repo.toggleLike.mockResolvedValueOnce(false);
    repo.countLikes.mockResolvedValueOnce(3);
    await expect(service.toggleLike(viewer, 'p1')).resolves.toEqual({
      liked: false,
      likesCount: 3,
    });
    expect(repo.toggleLike).toHaveBeenNthCalledWith(1, 'p1', 'user-b', false);
    expect(repo.toggleLike).toHaveBeenNthCalledWith(2, 'p1', 'user-b', true);
    expect(cache.del).toHaveBeenCalledWith('posts:feed:first');
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
