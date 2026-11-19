import { MentionsService } from './mentions.service';

function user(id: string, username: string, prefs: unknown = {}) {
  return {
    id,
    username,
    displayName: username,
    arabicName: username,
    avatar: null,
    notificationPrefs: prefs,
  };
}

function make(overrides?: {
  users?: ReturnType<typeof user>[];
  existing?: string[];
  blocks?: Array<[string, string]>;
}) {
  const users = overrides?.users ?? [user('u2', 'sara'), user('u3', 'ali')];
  const notifyUser = jest.fn().mockResolvedValue(undefined);
  const mention = {
    findMany: jest
      .fn()
      .mockResolvedValue(
        (overrides?.existing ?? []).map((mentionedId) => ({ mentionedId })),
      ),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(users),
      findUnique: jest.fn().mockResolvedValue({
        arabicName: 'سعد',
        displayName: 'سعد',
        username: 'saad',
        avatar: null,
      }),
    },
    mention,
    userBlock: {
      findMany: jest.fn().mockResolvedValue(
        (overrides?.blocks ?? []).map(([blockerId, blockedId]) => ({
          blockerId,
          blockedId,
        })),
      ),
    },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new MentionsService(
    prisma as never,
    { notifyUser } as never,
    { warn: jest.fn() } as never,
  );
  return { service, prisma, notifyUser, mention };
}

describe('MentionsService.sync', () => {
  it('notifies a new mention and skips someone already mentioned', async () => {
    const { service, notifyUser, mention } = make({ existing: ['u2'] });
    const result = await service.sync({
      actorId: 'u1',
      entityType: 'post',
      entityId: 'p1',
      texts: ['يا @sara و @ali و @sara'],
      context: { postId: 'p1' },
    });
    expect(result.notified).toEqual(['u3']);
    expect(mention.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ mentionedId: 'u3', username: 'ali' })],
      }),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u3',
        type: 'mention',
        data: expect.objectContaining({
          mention: '1',
          postId: 'p1',
          actorId: 'u1',
        }),
      }),
    );
  });

  it('does not notify a blocked account or someone who turned mentions off', async () => {
    const { service, notifyUser } = make({
      users: [user('u2', 'sara', { mentions: false }), user('u3', 'ali')],
      blocks: [['u1', 'u3']],
    });
    const result = await service.sync({
      actorId: 'u1',
      entityType: 'listing_comment',
      entityId: 'c1',
      texts: ['@sara @ali @saad'],
    });
    expect(result.notified).toEqual([]);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('ranks followed accounts first', async () => {
    const { service, prisma } = make();
    prisma.user.findMany.mockResolvedValue([
      user('b', 'baker'),
      user('a', 'sara'),
    ]);
    prisma.follow.findMany.mockResolvedValue([{ followingId: 'b' }]);
    const rows = await service.suggest('viewer', 'a');
    expect(rows.map((row) => row.username)).toEqual(['baker', 'sara']);
    expect(rows[0].following).toBe(true);
    expect(rows[1].following).toBe(false);
  });
});
