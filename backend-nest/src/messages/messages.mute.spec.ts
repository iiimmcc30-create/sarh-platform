import { MessagesService } from './messages.service';
import { MessagingPolicyService } from './services/messaging-policy.service';
import { SocketGatewayService } from '../gateway/services/socket-gateway.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

const THREAD = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function user(id: string): JwtPayload {
  return { userId: id, username: id, role: 'USER' };
}

const mediaStub = () =>
  ({
    verifyForSend: jest.fn((_u: string, p: unknown) => Promise.resolve(p)),
    presentMessage: jest.fn((m: unknown) => m),
    presentMessages: jest.fn((m: unknown) => m),
  }) as never;

describe('MessagingPolicyService.isThreadMuted', () => {
  it('reads the participant state row (mutedAt) for that user only', async () => {
    const repo = {
      findThreadState: jest
        .fn()
        .mockResolvedValueOnce({ mutedAt: new Date() })
        .mockResolvedValueOnce({ mutedAt: null })
        .mockResolvedValueOnce(null),
    };
    const policy = new MessagingPolicyService(repo as never);
    await expect(policy.isThreadMuted(THREAD, BOB)).resolves.toBe(true);
    await expect(policy.isThreadMuted(THREAD, BOB)).resolves.toBe(false);
    await expect(policy.isThreadMuted(THREAD, BOB)).resolves.toBe(false);
    expect(repo.findThreadState).toHaveBeenCalledWith(THREAD, BOB);
  });
});

describe('MessagesService thread mute', () => {
  const repo = {
    upsertThread: jest.fn(),
    createMessage: jest.fn(),
    clearHiddenForThread: jest.fn(),
    findThreadsForUser: jest.fn(),
    findParticipants: jest.fn(),
    countUnreadByThread: jest.fn(),
    findThreadForUser: jest.fn(),
    upsertThreadState: jest.fn(),
    findMessages: jest.fn(),
    markThreadRead: jest.fn(),
    findActiveParticipant: jest.fn(),
    findThreadsForPair: jest.fn(),
    touchThread: jest.fn(),
  };
  const policy = {
    assertCanSendMessage: jest.fn(),
    isThreadMuted: jest.fn(),
  };
  const logger = { info: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const sockets = { emitToThread: jest.fn(), emitToUser: jest.fn() };
  let service: MessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    policy.isThreadMuted.mockResolvedValue(false);
    repo.clearHiddenForThread.mockResolvedValue({ count: 0 });
    repo.upsertThread.mockResolvedValue({ id: THREAD });
    repo.findThreadsForPair.mockResolvedValue([]);
    repo.createMessage.mockResolvedValue({
      id: 'm1',
      senderId: 'alice',
      receiverId: BOB,
      text: 'hi',
      sender: { arabicName: 'أ', displayName: 'A', avatar: null },
    });
    service = new MessagesService(
      repo as never,
      logger as never,
      notifications as never,
      policy as never,
      sockets as never,
      mediaStub(),
    );
  });

  it('mutes server-side on the caller state row (no messages touched)', async () => {
    repo.findThreadForUser.mockResolvedValue({ id: THREAD, type: 'DIRECT' });
    const mutedAt = new Date('2026-09-30T04:00:00.000Z');
    repo.upsertThreadState.mockResolvedValue({
      pinnedAt: null,
      hiddenAt: null,
      mutedAt,
    });

    await expect(
      service.muteThread(user('alice'), THREAD, true),
    ).resolves.toEqual({
      muted: true,
      mutedAt,
    });
    expect(repo.findThreadForUser).toHaveBeenCalledWith(THREAD, 'alice');
    expect(repo.upsertThreadState).toHaveBeenCalledWith(THREAD, 'alice', {
      mutedAt: expect.any(Date),
    });
    expect(repo.createMessage).not.toHaveBeenCalled();
  });

  it('unmutes by clearing mutedAt', async () => {
    repo.findThreadForUser.mockResolvedValue({ id: THREAD, type: 'DIRECT' });
    repo.upsertThreadState.mockResolvedValue({
      pinnedAt: null,
      hiddenAt: null,
      mutedAt: null,
    });
    await expect(
      service.muteThread(user('alice'), THREAD, false),
    ).resolves.toEqual({
      muted: false,
      mutedAt: null,
    });
    expect(repo.upsertThreadState).toHaveBeenCalledWith(THREAD, 'alice', {
      mutedAt: null,
    });
  });

  it('refuses to mute a thread the user is not part of', async () => {
    repo.findThreadForUser.mockResolvedValue(null);
    await expect(
      service.muteThread(user('eve'), THREAD, true),
    ).rejects.toBeInstanceOf(ApiException);
    expect(repo.upsertThreadState).not.toHaveBeenCalled();
  });

  it('skips the push for a receiver who muted, but still stores + delivers the message', async () => {
    policy.isThreadMuted.mockResolvedValue(true);
    const res = await service.sendMessage(user('alice'), {
      receiverId: BOB,
      text: 'hi',
    });

    expect(res.message).toMatchObject({ id: 'm1' });
    expect(repo.createMessage).toHaveBeenCalledTimes(1);
    expect(policy.isThreadMuted).toHaveBeenCalledWith(THREAD, BOB);
    expect(sockets.emitToThread).toHaveBeenCalledWith(
      THREAD,
      'chat:message',
      expect.objectContaining({ id: 'm1' }),
    );
    expect(sockets.emitToUser).toHaveBeenCalledWith(
      BOB,
      'chat:notification',
      expect.objectContaining({ threadId: THREAD, muted: true }),
    );
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('still pushes when the receiver has not muted (sender mute is irrelevant)', async () => {
    policy.isThreadMuted.mockImplementation((_t: string, uid: string) =>
      Promise.resolve(uid === 'alice'),
    );
    await service.sendMessage(user('alice'), { receiverId: BOB, text: 'hi' });
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BOB, type: 'new_message' }),
    );
  });

  it('exposes isMuted in the inbox, the thread messages and the peer lookup', async () => {
    repo.findThreadsForUser.mockResolvedValue([
      {
        id: THREAD,
        participant1: 'alice',
        participant2: BOB,
        type: 'DIRECT',
        lastMessageAt: new Date(),
        messages: [],
        states: [{ pinnedAt: null, hiddenAt: null, mutedAt: new Date() }],
      },
    ]);
    repo.findParticipants.mockResolvedValue([
      {
        id: BOB,
        displayName: 'B',
        arabicName: 'ب',
        avatar: null,
        username: 'b',
        verified: true,
      },
    ]);
    repo.countUnreadByThread.mockResolvedValue([]);
    const threads = await service.getThreads(user('alice'));
    expect(threads[0]).toMatchObject({
      isMuted: true,
      participant: expect.objectContaining({ verified: true }),
    });

    repo.findThreadForUser.mockResolvedValue({ id: THREAD, type: 'DIRECT' });
    repo.findMessages.mockResolvedValue([]);
    repo.markThreadRead.mockResolvedValue({ count: 0 });
    policy.isThreadMuted.mockResolvedValue(true);
    await expect(
      service.getThreadMessages(user('alice'), THREAD, {}),
    ).resolves.toMatchObject({ isMuted: true });

    repo.findActiveParticipant.mockResolvedValue({ id: BOB, verified: true });
    repo.findThreadsForPair.mockResolvedValue([
      { id: THREAD, scopeKey: 'direct', type: 'DIRECT' },
    ]);
    await expect(
      service.getPeerConversation(user('alice'), BOB),
    ).resolves.toMatchObject({
      threadId: THREAD,
      isMuted: true,
      participant: { verified: true },
    });
    expect(policy.isThreadMuted).toHaveBeenLastCalledWith(THREAD, 'alice');
  });
});

describe('SocketGatewayService chat:send respects receiver mute', () => {
  const repo = {
    isThreadParticipant: jest.fn(),
    findThreadParticipants: jest.fn(),
    createMessageWithThreadUpdate: jest.fn(),
  };
  const emitService = { emitToThread: jest.fn(), emitToUser: jest.fn() };
  const policy = {
    assertCanSendMessage: jest.fn(),
    assertNotBlocked: jest.fn(),
    isThreadMuted: jest.fn(),
  };
  const notifications = { notifyUser: jest.fn() };
  let service: SocketGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.isThreadParticipant.mockResolvedValue({ id: THREAD });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: BOB,
    });
    repo.createMessageWithThreadUpdate.mockResolvedValue([
      {
        id: 'm1',
        text: 'hi',
        sender: { arabicName: 'أ', username: 'alice', avatar: null },
      },
    ]);
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    service = new SocketGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      notifications as never,
      emitService as never,
      { error: jest.fn() } as never,
      policy as never,
      {} as never,
      mediaStub(),
    );
  });

  it('delivers but does not push when the receiver muted the thread', async () => {
    policy.isThreadMuted.mockResolvedValue(true);
    const err = await service.handleChatSend(user('alice'), {
      threadId: THREAD,
      receiverId: BOB,
      text: 'hi',
    } as never);
    expect(err).toBeNull();
    expect(repo.createMessageWithThreadUpdate).toHaveBeenCalledTimes(1);
    expect(policy.isThreadMuted).toHaveBeenCalledWith(THREAD, BOB);
    expect(emitService.emitToThread).toHaveBeenCalledWith(
      THREAD,
      'chat:message',
      expect.objectContaining({ id: 'm1' }),
    );
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('pushes normally when not muted', async () => {
    policy.isThreadMuted.mockResolvedValue(false);
    await service.handleChatSend(user('alice'), {
      threadId: THREAD,
      receiverId: BOB,
      text: 'hi',
    } as never);
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BOB }),
    );
  });
});
