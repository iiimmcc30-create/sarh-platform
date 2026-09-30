import { MessagesService } from './messages.service';

const ALICE = { userId: 'alice', username: 'alice', role: 'USER' } as const;
const EVE = { userId: 'eve', username: 'eve', role: 'USER' } as const;

function person(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayName: id,
    arabicName: id,
    avatar: null,
    username: id,
    verified: false,
    ...extra,
  };
}

describe('MessagesService general 1:1 conversations', () => {
  const repo = {
    upsertThread: jest.fn(),
    createMessage: jest.fn(),
    clearHiddenForThread: jest.fn(),
    findThreadForUser: jest.fn(),
    findMessages: jest.fn(),
    markThreadRead: jest.fn(),
    upsertThreadState: jest.fn(),
    findThreadsForPair: jest.fn(),
    touchThread: jest.fn(),
    findActiveParticipant: jest.fn(),
    findBlockRelations: jest.fn(),
    findRecentPartnerThreads: jest.fn(),
    findFollowingUsers: jest.fn(),
    findFollowerUsers: jest.fn(),
    searchActiveUsers: jest.fn(),
    findParticipants: jest.fn(),
  };
  const policy = {
    assertCanSendMessage: jest.fn(),
    isThreadMuted: jest.fn().mockResolvedValue(false),
  };
  const sockets = { emitToThread: jest.fn(), emitToUser: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  let service: MessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    repo.clearHiddenForThread.mockResolvedValue({ count: 0 });
    repo.upsertThread.mockResolvedValue({ id: 'pair-thread' });
    // New pair by default (no existing thread): the 'direct' one is created.
    repo.findThreadsForPair.mockResolvedValue([]);
    repo.createMessage.mockImplementation(async (data: object) => ({
      id: 'm1',
      ...data,
      sender: { id: 'x', arabicName: 'س', displayName: 'S', avatar: null },
    }));
    service = new MessagesService(
      repo as never,
      { info: jest.fn() } as never,
      notifications as never,
      policy as never,
      sockets as never,
      {
        verifyForSend: jest.fn((_u: string, p: unknown) => Promise.resolve(p)),
        presentMessage: jest.fn((m: unknown) => m),
        presentMessages: jest.fn((m: unknown) => m),
      } as never,
    );
  });

  it('reuses one thread per pair regardless of who sends first (no listing scope)', async () => {
    await service.sendMessage(ALICE, {
      receiverId: 'bob',
      text: 'هل الإعلان متاح؟',
    });
    await service.sendMessage(
      { userId: 'bob', username: 'bob', role: 'USER' },
      { receiverId: 'alice', text: 'نعم' },
    );
    expect(repo.upsertThread).toHaveBeenCalledTimes(2);
    const [a, b] = repo.upsertThread.mock.calls.map(
      (c) => c[0] as Record<string, unknown>,
    );
    expect(a).toEqual({
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
    });
    expect(b).toEqual(a);
    expect(Object.keys(a)).not.toContain('listingId');
  });

  it('persists and emits an official VOICE message', async () => {
    await service.sendMessage(ALICE, {
      receiverId: 'bob',
      messageType: 'VOICE',
      audioUrl: 'https://cdn.x/v.m4a',
      durationMs: 5100,
      mediaMimeType: 'audio/mp4',
    });
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'VOICE',
        audioUrl: 'https://cdn.x/v.m4a',
        mediaDurationMs: 5100,
        mediaMimeType: 'audio/mp4',
      }),
    );
    expect(sockets.emitToThread).toHaveBeenCalledWith(
      'pair-thread',
      'chat:message',
      expect.objectContaining({ type: 'VOICE' }),
    );
    expect(sockets.emitToUser).toHaveBeenCalledWith(
      'bob',
      'chat:notification',
      expect.objectContaining({ preview: '🎤 رسالة صوتية' }),
    );
  });

  it('keeps legacy image sends working and tags them IMAGE', async () => {
    await service.sendMessage(ALICE, {
      receiverId: 'bob',
      imageUrl: 'https://cdn.x/a.jpg',
    });
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'IMAGE',
        imageUrl: 'https://cdn.x/a.jpg',
      }),
    );
  });

  it('rejects voice without duration before touching the DB', async () => {
    await expect(
      service.sendMessage(ALICE, {
        receiverId: 'bob',
        audioUrl: 'https://cdn.x/v.m4a',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.upsertThread).not.toHaveBeenCalled();
  });

  it('resolves the peer conversation by pair, preferring the direct thread', async () => {
    repo.findActiveParticipant.mockResolvedValue(person('bob'));
    repo.findThreadsForPair.mockResolvedValue([
      {
        id: 'legacy-newer',
        type: 'DIRECT',
        scopeKey: 'legacy:1',
        lastMessageAt: new Date(),
      },
      {
        id: 'direct',
        type: 'DIRECT',
        scopeKey: 'direct',
        lastMessageAt: new Date(0),
      },
    ]);
    const res = await service.getPeerConversation(ALICE, 'bob');
    expect(repo.findThreadsForPair).toHaveBeenCalledWith('alice', 'bob');
    expect(res.threadId).toBe('direct');
    expect(res.participant.id).toBe('bob');
  });

  it('falls back to the most recent legacy thread, or null for a new pair', async () => {
    repo.findActiveParticipant.mockResolvedValue(person('bob'));
    repo.findThreadsForPair.mockResolvedValueOnce([
      {
        id: 'legacy-a',
        type: 'DIRECT',
        scopeKey: 'legacy:a',
        lastMessageAt: new Date(),
      },
    ]);
    expect((await service.getPeerConversation(ALICE, 'bob')).threadId).toBe(
      'legacy-a',
    );
    repo.findThreadsForPair.mockResolvedValueOnce([]);
    expect(
      (await service.getPeerConversation(ALICE, 'bob')).threadId,
    ).toBeNull();
  });

  it('rejects self and unknown peers', async () => {
    await expect(
      service.getPeerConversation(ALICE, 'alice'),
    ).rejects.toMatchObject({
      status: 400,
    });
    repo.findActiveParticipant.mockResolvedValue(null);
    await expect(
      service.getPeerConversation(ALICE, 'ghost'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists contacts from past chats + follows, deduped, excluding blocked users', async () => {
    repo.findBlockRelations.mockResolvedValue([
      { blockerId: 'alice', blockedId: 'mallory' },
      { blockerId: 'trudy', blockedId: 'alice' },
    ]);
    repo.findRecentPartnerThreads.mockResolvedValue([
      { participant1: 'alice', participant2: 'bob' },
      { participant1: 'alice', participant2: 'trudy' },
    ]);
    repo.findParticipants.mockResolvedValue([person('bob'), person('trudy')]);
    repo.findFollowingUsers.mockResolvedValue([
      { following: person('carol') },
      { following: person('bob') },
      { following: person('mallory') },
    ]);
    repo.findFollowerUsers.mockResolvedValue([{ follower: person('dave') }]);
    const res = await service.getContacts(ALICE, {});
    expect(res.map((u) => [u.id, u.source])).toEqual([
      ['bob', 'recent'],
      ['carol', 'following'],
      ['dave', 'follower'],
    ]);
    expect(repo.searchActiveUsers).not.toHaveBeenCalled();
  });

  it('filters contacts by query and appends global user search results', async () => {
    repo.findBlockRelations.mockResolvedValue([]);
    repo.findRecentPartnerThreads.mockResolvedValue([]);
    repo.findFollowingUsers.mockResolvedValue([
      { following: person('carol', { arabicName: 'كارول' }) },
      { following: person('dave') },
    ]);
    repo.findFollowerUsers.mockResolvedValue([]);
    repo.searchActiveUsers.mockResolvedValue([
      person('caroline'),
      person('carol'),
    ]);
    const res = await service.getContacts(ALICE, { q: 'car' });
    expect(repo.searchActiveUsers).toHaveBeenCalledWith('car', 'alice', 20);
    expect(res.map((u) => [u.id, u.source])).toEqual([
      ['carol', 'following'],
      ['caroline', 'search'],
    ]);
  });

  describe('authorization: non-participants are denied', () => {
    beforeEach(() => repo.findThreadForUser.mockResolvedValue(null));

    it('cannot read messages', async () => {
      await expect(
        service.getThreadMessages(EVE, 'thread-ab', {}),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.findThreadForUser).toHaveBeenCalledWith('thread-ab', 'eve');
      expect(repo.findMessages).not.toHaveBeenCalled();
      expect(repo.markThreadRead).not.toHaveBeenCalled();
    });

    it('cannot pin or hide the thread', async () => {
      await expect(
        service.pinThread(EVE, 'thread-ab', true),
      ).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.hideThread(EVE, 'thread-ab')).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.upsertThreadState).not.toHaveBeenCalled();
    });
  });
});
