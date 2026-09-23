import { MessagesService } from './messages.service';
import { ApiException } from '../common/exceptions/api.exception';

const user = { userId: 'alice', username: 'alice', role: 'USER' } as const;

function threadRow(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    participant1: 'alice',
    participant2: 'bob',
    type: 'DIRECT',
    butcherId: null,
    butcher: null,
    lastMessageAt: new Date('2026-09-20T10:00:00.000Z'),
    messages: [
      {
        text: 'مرحبا',
        videoUrl: null,
        imageUrl: null,
        senderId: 'bob',
      },
    ],
    states: [],
    ...extra,
  };
}

describe('MessagesService.sendMessage block enforcement', () => {
  const repo = {
    upsertThread: jest.fn(),
    createMessage: jest.fn(),
    clearHiddenForThread: jest.fn(),
    findThreadsForUser: jest.fn(),
    findParticipants: jest.fn(),
    countUnreadByThread: jest.fn(),
    findThreadForUser: jest.fn(),
    upsertThreadState: jest.fn(),
  };
  const policy = {
    assertCanSendMessage: jest.fn(),
  };
  const logger = { info: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const sockets = { emitToThread: jest.fn(), emitToUser: jest.fn() };

  let service: MessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.clearHiddenForThread.mockResolvedValue({ count: 0 });
    service = new MessagesService(
      repo as never,
      logger as never,
      notifications as never,
      policy as never,
      sockets as never,
    );
  });

  it('does not persist a REST butcher-shop message when policy forbids', async () => {
    policy.assertCanSendMessage.mockRejectedValue(
      new ApiException(403, 'forbidden', 'التواصل المباشر مع الملحمة غير متاح'),
    );

    await expect(
      service.sendMessage(
        { userId: 'customer', username: 'c', role: 'USER' },
        {
          receiverId: 'butcher-user',
          text: 'hello shop',
          type: 'BUTCHER',
          butcherId: 'shop-1',
        },
      ),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });

    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(repo.upsertThread).not.toHaveBeenCalled();
  });

  it('does not persist a REST message when the policy rejects a block', async () => {
    policy.assertCanSendMessage.mockRejectedValue(
      new ApiException(403, 'blocked', 'لا يمكنك مراسلة هذا المستخدم'),
    );

    await expect(
      service.sendMessage(
        { userId: 'blocked', username: 'b', role: 'USER' },
        { receiverId: 'victim', text: 'hi' },
      ),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });

    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(repo.upsertThread).not.toHaveBeenCalled();
  });

  it('emits chat:message after a successful REST send', async () => {
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    repo.upsertThread.mockResolvedValue({ id: 't1' });
    repo.createMessage.mockResolvedValue({
      id: 'm1',
      senderId: 'alice',
      receiverId: 'bob',
      text: 'hi',
      sender: {
        arabicName: 'أ',
        displayName: 'A',
        avatar: null,
        username: 'alice',
      },
    });

    await service.sendMessage(
      { userId: 'alice', username: 'alice', role: 'USER' },
      { receiverId: 'bob', text: 'hi' },
    );

    expect(repo.clearHiddenForThread).toHaveBeenCalledWith('t1');
    expect(sockets.emitToThread).toHaveBeenCalledWith(
      't1',
      'chat:message',
      expect.objectContaining({ id: 'm1' }),
    );
    expect(sockets.emitToUser).toHaveBeenCalledWith(
      'bob',
      'chat:notification',
      expect.objectContaining({ threadId: 't1' }),
    );
  });

  it('does not convert an order-linked send into butcher chat', async () => {
    policy.assertCanSendMessage.mockRejectedValue(
      new ApiException(403, 'forbidden', 'التواصل المباشر مع الملحمة غير متاح'),
    );

    await expect(
      service.sendMessage(
        { userId: 'customer', username: 'c', role: 'USER' },
        {
          receiverId: 'butcher-user',
          text: 'from support ticket',
          orderId: 'ord-1',
        },
      ),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });

    expect(repo.createMessage).not.toHaveBeenCalled();
    expect(repo.upsertThread).not.toHaveBeenCalled();
  });
});

describe('MessagesService inbox pin and hide', () => {
  const repo = {
    findThreadsForUser: jest.fn(),
    findParticipants: jest.fn(),
    countUnreadByThread: jest.fn(),
    findThreadForUser: jest.fn(),
    upsertThreadState: jest.fn(),
    upsertThread: jest.fn(),
    createMessage: jest.fn(),
    clearHiddenForThread: jest.fn(),
  };
  const policy = { assertCanSendMessage: jest.fn() };
  const logger = { info: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const sockets = { emitToThread: jest.fn(), emitToUser: jest.fn() };

  let service: MessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessagesService(
      repo as never,
      logger as never,
      notifications as never,
      policy as never,
      sockets as never,
    );
  });

  it('returns pinned threads first and maps isPinned', async () => {
    repo.findThreadsForUser.mockResolvedValue([
      threadRow('recent', {
        lastMessageAt: new Date('2026-09-21T12:00:00.000Z'),
      }),
      threadRow('pinned-old', {
        lastMessageAt: new Date('2026-09-01T12:00:00.000Z'),
        states: [
          { pinnedAt: new Date('2026-09-10T00:00:00.000Z'), hiddenAt: null },
        ],
      }),
    ]);
    repo.findParticipants.mockResolvedValue([
      {
        id: 'bob',
        displayName: 'Bob',
        arabicName: 'بوب',
        avatar: null,
        username: 'bob',
        verified: false,
      },
    ]);
    repo.countUnreadByThread.mockResolvedValue([]);

    const result = await service.getThreads(user);
    expect(result.map((t) => t.id)).toEqual(['pinned-old', 'recent']);
    expect(result[0]?.isPinned).toBe(true);
    expect(result[1]?.isPinned).toBe(false);
  });

  it('hides a thread the current user belongs to', async () => {
    repo.findThreadForUser.mockResolvedValue({
      id: 't1',
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
      butcherId: null,
    });
    repo.upsertThreadState.mockResolvedValue({
      pinnedAt: null,
      hiddenAt: new Date(),
    });

    await expect(service.hideThread(user, 't1')).resolves.toEqual({
      hidden: true,
    });
    expect(repo.upsertThreadState).toHaveBeenCalledWith(
      't1',
      'alice',
      expect.objectContaining({ hiddenAt: expect.any(Date) }),
    );
  });

  it('rejects hide when the user is not a participant', async () => {
    repo.findThreadForUser.mockResolvedValue(null);
    await expect(service.hideThread(user, 'foreign')).rejects.toMatchObject({
      status: 404,
      error: 'not_found',
    });
    expect(repo.upsertThreadState).not.toHaveBeenCalled();
  });

  it('pins and unpins a thread the current user belongs to', async () => {
    repo.findThreadForUser.mockResolvedValue({
      id: 't1',
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
      butcherId: null,
    });
    repo.upsertThreadState.mockResolvedValue({
      pinnedAt: new Date('2026-09-22T00:00:00.000Z'),
      hiddenAt: null,
    });

    await expect(service.pinThread(user, 't1', true)).resolves.toMatchObject({
      pinned: true,
    });
    expect(repo.upsertThreadState).toHaveBeenCalledWith(
      't1',
      'alice',
      expect.objectContaining({ pinnedAt: expect.any(Date) }),
    );

    repo.upsertThreadState.mockResolvedValue({
      pinnedAt: null,
      hiddenAt: null,
    });
    await expect(service.pinThread(user, 't1', false)).resolves.toEqual({
      pinned: false,
      pinnedAt: null,
    });
  });

  it('rejects pin when the user is not a participant', async () => {
    repo.findThreadForUser.mockResolvedValue(null);
    await expect(
      service.pinThread(user, 'foreign', true),
    ).rejects.toMatchObject({
      status: 404,
      error: 'not_found',
    });
    expect(repo.upsertThreadState).not.toHaveBeenCalled();
  });
});
