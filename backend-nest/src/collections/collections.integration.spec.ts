import { PrismaClient } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { PostsService } from '../posts/posts.service';
import { PostsRepository } from '../posts/repositories/posts.repository';
import { ListingsService } from '../listings/listings.service';
import { ListingsRepository } from '../listings/repositories/listings.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

/**
 * Real-database suite for «المجموعات». Runs only against a disposable Postgres with
 * every migration applied:
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://... npx jest collections.integration
 */
const DB_URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type ApiErr = { status: number; error: string };

async function apiError(fn: () => Promise<unknown>): Promise<ApiErr> {
  try {
    await fn();
  } catch (err) {
    return err as ApiErr;
  }
  throw new Error('expected an ApiException');
}

suite('CollectionsService (real Postgres)', () => {
  let prisma: PrismaClient;
  let service: CollectionsService;
  const tag = `c${Date.now().toString(36)}`;
  const jwt = (userId: string): JwtPayload =>
    ({ userId, username: userId }) as unknown as JwtPayload;

  let owner = '';
  let other = '';
  let memberA = '';
  let memberB = '';
  let outsider = '';

  async function makeUser(name: string) {
    const user = await prisma.user.create({
      data: {
        username: `${tag}_${name}`,
        passwordHash: 'x',
        displayName: `${name} user`,
        arabicName: `مستخدم ${name}`,
      },
    });
    return user.id;
  }

  function makePost(authorId: string, content: string, at?: Date) {
    return prisma.post.create({
      data: {
        authorId,
        content,
        arabicContent: content,
        ...(at ? { createdAt: at } : {}),
      },
    });
  }

  function makeListing(sellerId: string, title: string) {
    return prisma.listing.create({
      data: {
        sellerId,
        title,
        arabicTitle: title,
        description: 'd',
        arabicDescription: 'd',
        price: 100,
        category: 'camels',
        location: 'Riyadh',
        arabicLocation: 'الرياض',
        country: 'SA',
        status: 'active',
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    const usersRepo = new UsersRepository(db);
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const posts = new PostsService(
      new PostsRepository(db),
      usersRepo,
      cache as never,
      {} as never,
    );
    const unused = {} as never;
    const listings = new ListingsService(
      new ListingsRepository(db),
      usersRepo,
      cache as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    service = new CollectionsService(db, usersRepo, posts, listings);

    owner = await makeUser('owner');
    other = await makeUser('other');
    memberA = await makeUser('memberA');
    memberB = await makeUser('memberB');
    outsider = await makeUser('outsider');
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [owner, other, memberA, memberB, outsider].filter(Boolean);
    await prisma.collection.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: ids } } });
    await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.userBlock.deleteMany({ where: { blockerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('creates POSTS and ADS collections with counts and owner identity', async () => {
    const posts = await service.create(jwt(owner), {
      name: `  ${tag} منشورات  `,
      description: 'وصف',
      type: 'POSTS',
    });
    expect(posts).toMatchObject({
      name: `${tag} منشورات`,
      type: 'POSTS',
      membersCount: 0,
      followersCount: 0,
      isOwner: true,
      isFollowing: false,
      owner: { id: owner, username: `${tag}_owner` },
    });
    const ads = await service.create(jwt(owner), {
      name: `${tag} إعلانات`,
      type: 'ADS',
    });
    expect(ads.type).toBe('ADS');
    expect(ads.description).toBeNull();
  });

  it('adds and removes members and prevents duplicates', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} members`,
      type: 'POSTS',
    });
    await expect(
      service.addMember(jwt(owner), c.id, { userId: memberA }),
    ).resolves.toEqual({ added: true, membersCount: 1 });
    const dup = await apiError(() =>
      service.addMember(jwt(owner), c.id, { userId: memberA }),
    );
    expect(dup).toMatchObject({ status: 409, error: 'already_member' });
    expect(
      await prisma.collectionMember.count({ where: { collectionId: c.id } }),
    ).toBe(1);

    await service.addMember(jwt(owner), c.id, { userId: memberB });
    const listed = await service.listMembers(c.id, undefined, jwt(other));
    expect(listed.users.map((u) => u.id).sort()).toEqual(
      [memberA, memberB].sort(),
    );

    await expect(
      service.removeMember(jwt(owner), c.id, memberA),
    ).resolves.toEqual({ removed: true, membersCount: 1 });
    expect((await service.detail(c.id, jwt(other))).membersCount).toBe(1);
  });

  it('follows / unfollows idempotently, independent from membership', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} follow`,
      type: 'POSTS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberA });
    await expect(service.follow(jwt(other), c.id)).resolves.toEqual({
      following: true,
      followersCount: 1,
    });
    await expect(service.follow(jwt(other), c.id)).resolves.toEqual({
      following: true,
      followersCount: 1,
    });
    const detail = await service.detail(c.id, jwt(other));
    expect(detail).toMatchObject({
      isFollowing: true,
      followersCount: 1,
      membersCount: 1,
      isOwner: false,
    });
    const mine = await service.mine(jwt(other), undefined);
    expect(mine.collections.map((x) => x.id)).toContain(c.id);
    const followers = await service.listFollowers(c.id, undefined);
    expect(followers.users.map((u) => u.id)).toEqual([other]);

    await expect(service.unfollow(jwt(other), c.id)).resolves.toEqual({
      following: false,
      followersCount: 0,
    });
    expect((await service.detail(c.id, jwt(other))).isFollowing).toBe(false);
    // Following never made «other» a member.
    expect((await service.detail(c.id)).membersCount).toBe(1);

    const own = await apiError(() => service.follow(jwt(owner), c.id));
    expect(own.status).toBe(400);
  });

  it('POSTS feed shows members posts only, live, and never listings', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} feed posts`,
      type: 'POSTS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberA });
    const p1 = await makePost(memberA, `${tag} member post`);
    await makePost(outsider, `${tag} outsider post`);
    await makeListing(memberA, `${tag} member listing`);
    const hidden = await makePost(memberA, `${tag} hidden`);
    await prisma.post.update({
      where: { id: hidden.id },
      data: { isHidden: true },
    });

    let feed = await service.feed(c.id, undefined, jwt(other));
    expect(feed.type).toBe('POSTS');
    expect('listings' in feed).toBe(false);
    const ids = (feed as { posts: Array<{ id: string }> }).posts.map(
      (p) => p.id,
    );
    expect(ids).toEqual([p1.id]);
    const first = (feed as { posts: Array<Record<string, unknown>> }).posts[0];
    // Same shape as the main feed (PostItem renders it as-is).
    expect(first).toEqual(
      expect.objectContaining({
        likesCount: 0,
        repostsCount: 0,
        commentsCount: 0,
        liked: false,
        author: expect.objectContaining({ id: memberA }),
      }),
    );

    // New content appears without copying anything.
    const p2 = await makePost(memberA, `${tag} newer`);
    feed = await service.feed(c.id, undefined, jwt(other));
    expect(
      (feed as { posts: Array<{ id: string }> }).posts.map((p) => p.id),
    ).toEqual([p2.id, p1.id]);
  });

  it('ADS feed shows members active listings only and never posts', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} feed ads`,
      type: 'ADS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberB });
    const l1 = await makeListing(memberB, `${tag} b listing`);
    const sold = await makeListing(memberB, `${tag} b sold`);
    await prisma.listing.update({
      where: { id: sold.id },
      data: { status: 'sold' },
    });
    await makeListing(outsider, `${tag} outsider listing`);
    await makePost(memberB, `${tag} b post`);

    const feed = await service.feed(c.id, undefined, jwt(other));
    expect(feed.type).toBe('ADS');
    expect('posts' in feed).toBe(false);
    const listings = (feed as { listings: Array<Record<string, unknown>> })
      .listings;
    expect(listings.map((l) => l.id)).toEqual([l1.id]);
    expect(listings[0]).toEqual(
      expect.objectContaining({
        seller: expect.objectContaining({ id: memberB }),
      }),
    );
  });

  it('switching the type re-reads the same members as listings (no copies)', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} switch`,
      type: 'POSTS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberB });
    await service.update(jwt(owner), c.id, { type: 'ADS' });
    const feed = await service.feed(c.id, undefined);
    expect(feed.type).toBe('ADS');
    expect((feed as { listings: unknown[] }).listings.length).toBeGreaterThan(
      0,
    );
  });

  it('paginates the feed with a cursor (20 per page, no overlap)', async () => {
    const author = await makeUser('pager');
    try {
      const c = await service.create(jwt(owner), {
        name: `${tag} pager`,
        type: 'POSTS',
      });
      await service.addMember(jwt(owner), c.id, { userId: author });
      const base = Date.now() - 100_000;
      for (let i = 0; i < 23; i++) {
        await makePost(author, `${tag} p${i}`, new Date(base + i * 1000));
      }
      const page1 = (await service.feed(c.id, undefined)) as {
        posts: Array<{ id: string }>;
        nextCursor: string | null;
        hasMore: boolean;
      };
      expect(page1.posts).toHaveLength(20);
      expect(page1.hasMore).toBe(true);
      const page2 = (await service.feed(
        c.id,
        page1.nextCursor ?? undefined,
      )) as typeof page1;
      expect(page2.posts).toHaveLength(3);
      expect(page2.hasMore).toBe(false);
      const all = new Set([...page1.posts, ...page2.posts].map((p) => p.id));
      expect(all.size).toBe(23);
    } finally {
      await prisma.collection.deleteMany({
        where: { members: { some: { userId: author } } },
      });
      await prisma.post.deleteMany({ where: { authorId: author } });
      await prisma.user.delete({ where: { id: author } });
    }
  });

  it('searches collections by name and paginates lists', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} مجموعة الإبل`,
      type: 'ADS',
    });
    const found = await service.search(`${tag} مجموعة`, undefined, jwt(other));
    expect(found.collections.map((x) => x.id)).toContain(c.id);
    // Alef-insensitive match (reuses the search module variants).
    const alef = await service.search('الابل', undefined, jwt(other));
    expect(alef.collections.map((x) => x.id)).toContain(c.id);
    const none = await service.search(`${tag}-zzz`, undefined, jwt(other));
    expect(none.collections).toHaveLength(0);
    const blank = await service.search('  ', undefined);
    expect(blank).toEqual({
      collections: [],
      nextCursor: null,
      hasMore: false,
    });

    const suggested = await service.suggested(undefined, jwt(other));
    expect(suggested.collections.length).toBeGreaterThan(0);
    expect(suggested.collections.every((x) => x.owner.id !== other)).toBe(true);
  });

  it('searches users by name and @username and flags members', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} users`,
      type: 'POSTS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberA });
    const byHandle = await service.searchUsers(
      jwt(owner),
      `@${tag}_member`,
      c.id,
    );
    const flags = Object.fromEntries(
      byHandle.users.map((u) => [u.id, u.isMember]),
    );
    expect(flags[memberA]).toBe(true);
    expect(flags[memberB]).toBe(false);
    const byName = await service.searchUsers(jwt(owner), 'memberB user');
    expect(byName.users.map((u) => u.id)).toContain(memberB);
    const suggested = await service.searchUsers(jwt(owner), '');
    expect(suggested.users.map((u) => u.id)).not.toContain(owner);
  });

  it('forbids non-owners from managing a collection', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} authz`,
      type: 'POSTS',
    });
    const attempts = [
      () => service.update(jwt(other), c.id, { name: 'hijack' }),
      () => service.remove(jwt(other), c.id),
      () => service.addMember(jwt(other), c.id, { userId: memberA }),
      () => service.removeMember(jwt(other), c.id, memberA),
      () => service.searchUsers(jwt(other), 'x', c.id),
    ];
    for (const attempt of attempts) {
      expect(await apiError(attempt)).toMatchObject({
        status: 403,
        error: 'forbidden',
      });
    }
    expect((await service.detail(c.id)).name).toBe(`${tag} authz`);

    await service.update(jwt(owner), c.id, {
      name: `${tag} edited`,
      description: '',
      coverUrl: null,
    });
    const edited = await service.detail(c.id);
    expect(edited).toMatchObject({
      name: `${tag} edited`,
      description: null,
      coverUrl: null,
    });
    await expect(service.remove(jwt(owner), c.id)).resolves.toEqual({
      deleted: true,
    });
    expect((await apiError(() => service.detail(c.id))).status).toBe(404);
  });

  it('block hides the collection for that user only and drops the follow', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} blockme`,
      type: 'POSTS',
    });
    await service.follow(jwt(other), c.id);
    await expect(service.block(jwt(other), c.id)).resolves.toEqual({
      blocked: true,
    });
    expect(
      (await apiError(() => service.detail(c.id, jwt(other)))).status,
    ).toBe(404);
    const search = await service.search(
      `${tag} blockme`,
      undefined,
      jwt(other),
    );
    expect(search.collections).toHaveLength(0);
    const mine = await service.mine(jwt(other), undefined);
    expect(mine.collections.map((x) => x.id)).not.toContain(c.id);
    // Others still see it.
    expect((await service.detail(c.id, jwt(outsider))).followersCount).toBe(0);

    await service.unblock(jwt(other), c.id);
    expect((await service.detail(c.id, jwt(other))).id).toBe(c.id);
  });

  it('member-of lists only collections where the user is a MEMBER', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} memberof`,
      type: 'POSTS',
    });
    const followedOnly = await service.create(jwt(owner), {
      name: `${tag} followed only`,
      type: 'POSTS',
    });
    const post = await makePost(memberB, `${tag} stays after removal`);
    await service.follow(jwt(memberB), followedOnly.id);

    // Owner-only and follower-only are not «المضاف إليها».
    const before = await service.memberOf(memberB, undefined, jwt(other));
    expect(before.collections.map((x) => x.id)).not.toContain(c.id);
    expect(before.collections.map((x) => x.id)).not.toContain(followedOnly.id);
    const ownerList = await service.memberOf(owner, undefined, jwt(other));
    expect(ownerList.collections.map((x) => x.id)).not.toContain(c.id);

    await service.addMember(jwt(owner), c.id, { userId: memberB });
    const after = await service.memberOf(memberB, undefined, jwt(other));
    const row = after.collections.find((x) => x.id === c.id);
    expect(row).toMatchObject({
      name: `${tag} memberof`,
      type: 'POSTS',
      owner: { id: owner },
      isFollowing: false,
    });
    expect(row!.membersCount).toBe(1);
    // Membership never creates a follow.
    expect((await service.detail(c.id, jwt(memberB))).isFollowing).toBe(false);
    // Opens through the same detail/feed.
    const feed = (await service.feed(c.id, undefined, jwt(memberB))) as {
      posts: Array<{ id: string }>;
    };
    expect(feed.posts.map((p) => p.id)).toContain(post.id);
    // Others are not listed.
    const notMember = await service.memberOf(memberA, undefined, jwt(other));
    expect(notMember.collections.map((x) => x.id)).not.toContain(c.id);

    // Following stays independent; removal drops the list entry + feed source only.
    await service.follow(jwt(memberB), c.id);
    await service.removeMember(jwt(owner), c.id, memberB);
    const removed = await service.memberOf(memberB, undefined, jwt(other));
    expect(removed.collections.map((x) => x.id)).not.toContain(c.id);
    const feedAfter = (await service.feed(c.id, undefined, jwt(other))) as {
      posts: Array<{ id: string }>;
    };
    expect(feedAfter.posts.map((p) => p.id)).not.toContain(post.id);
    expect(
      await prisma.post.findUnique({ where: { id: post.id } }),
    ).not.toBeNull();
    expect((await service.detail(c.id, jwt(memberB))).isFollowing).toBe(true);

    // Blocked relationship with the viewer => empty list.
    await prisma.userBlock.create({
      data: { blockerId: memberB, blockedId: memberA },
    });
    await service.addMember(jwt(owner), c.id, { userId: memberB });
    const blocked = await service.memberOf(memberB, undefined, jwt(memberA));
    expect(blocked.collections).toHaveLength(0);
    await prisma.userBlock.deleteMany({
      where: { blockerId: memberB, blockedId: memberA },
    });
  });

  it('profile cover column: set, replace and remove (nullable, existing User.coverImage)', async () => {
    const repo = new UsersRepository(prisma as unknown as PrismaService);
    await repo.updateUser(other, { coverImage: 'https://cdn.test/a.jpg' });
    await repo.updateUser(other, { coverImage: 'https://cdn.test/b.jpg' });
    expect(
      (await prisma.user.findUnique({ where: { id: other } }))?.coverImage,
    ).toBe('https://cdn.test/b.jpg');
    await repo.updateUser(other, { coverImage: null });
    expect(
      (await prisma.user.findUnique({ where: { id: other } }))?.coverImage,
    ).toBeNull();
  });

  it('respects user blocks with the owner and member authors', async () => {
    const c = await service.create(jwt(owner), {
      name: `${tag} userblock`,
      type: 'POSTS',
    });
    await service.addMember(jwt(owner), c.id, { userId: memberA });
    await makePost(memberA, `${tag} visible unless blocked`);
    await prisma.userBlock.create({
      data: { blockerId: outsider, blockedId: memberA },
    });
    const feed = (await service.feed(c.id, undefined, jwt(outsider))) as {
      posts: Array<{ authorId: string }>;
    };
    expect(feed.posts.some((p) => p.authorId === memberA)).toBe(false);

    await prisma.userBlock.create({
      data: { blockerId: outsider, blockedId: owner },
    });
    expect(
      (await apiError(() => service.detail(c.id, jwt(outsider)))).status,
    ).toBe(404);
  });
});
