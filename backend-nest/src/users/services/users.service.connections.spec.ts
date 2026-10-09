import { UsersService } from './users.service';

describe('UsersService.getConnections relationship flags', () => {
  const row = (id: string) => ({
    id,
    username: id,
    displayName: id,
    arabicName: id,
    avatar: null,
    verified: false,
    verifiedTier: null,
  });

  function makeService(opts: {
    followers?: string[];
    following?: string[];
    edges: { followerId: string; followingId: string }[];
  }) {
    const repo = {
      findActiveUserId: jest.fn().mockResolvedValue({ id: 'target' }),
      findUserPrivacyFlags: jest.fn().mockResolvedValue({ showFollowingList: true }),
      findFollowers: jest
        .fn()
        .mockResolvedValue((opts.followers ?? []).map((id) => ({ follower: row(id) }))),
      findFollowing: jest
        .fn()
        .mockResolvedValue((opts.following ?? []).map((id) => ({ following: row(id) }))),
      findViewerRelationEdges: jest.fn().mockResolvedValue(opts.edges),
    };
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = new UsersService(
      repo as never,
      {} as never,
      logger as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, repo };
  }

  it('returns isFollowing + followsYou per row from ONE relation query', async () => {
    const { service, repo } = makeService({
      followers: ['a', 'b', 'c', 'me'],
      edges: [
        { followerId: 'a', followingId: 'me' }, // a follows me, I don't follow a → follow back
        { followerId: 'me', followingId: 'b' }, // I follow b only
        { followerId: 'c', followingId: 'me' }, // mutual with c
        { followerId: 'me', followingId: 'c' },
      ],
    });
    const res = (await service.getConnections(
      'target',
      { type: 'followers' } as never,
      { userId: 'me' } as never,
    )) as { users: { id: string; isFollowing: boolean; followsYou: boolean }[] };

    expect(repo.findViewerRelationEdges).toHaveBeenCalledTimes(1);
    expect(repo.findViewerRelationEdges).toHaveBeenCalledWith('me', ['a', 'b', 'c', 'me']);
    const byId = Object.fromEntries(res.users.map((u) => [u.id, u]));
    expect(byId.a).toMatchObject({ isFollowing: false, followsYou: true });
    expect(byId.b).toMatchObject({ isFollowing: true, followsYou: false });
    expect(byId.c).toMatchObject({ isFollowing: true, followsYou: true });
    expect(byId.me).toMatchObject({ isFollowing: false, followsYou: false });
  });

  it('works on the following tab and for guests (all false, no relation query)', async () => {
    const { service, repo } = makeService({ following: ['x'], edges: [] });
    const res = (await service.getConnections('target', { type: 'following' } as never)) as {
      users: { isFollowing: boolean; followsYou: boolean }[];
    };
    expect(repo.findViewerRelationEdges).not.toHaveBeenCalled();
    expect(res.users[0]).toMatchObject({ isFollowing: false, followsYou: false });
  });
});
