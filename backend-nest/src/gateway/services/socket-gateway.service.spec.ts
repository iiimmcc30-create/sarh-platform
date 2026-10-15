import { SocketGatewayService } from './socket-gateway.service';
import { ApiException } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

function user(id: string): JwtPayload {
  return { userId: id, username: id, role: 'USER' };
}

describe('SocketGatewayService chat authorization', () => {
  const repo = {
    isThreadParticipant: jest.fn(),
    findThreadParticipants: jest.fn(),
    createMessageWithThreadUpdate: jest.fn(),
  };
  const messagingPolicy = {
    assertCanSendMessage: jest.fn(),
    assertNotBlocked: jest.fn(),
    isThreadMuted: jest.fn().mockResolvedValue(false),
  };
  const emitService = {
    emitToThread: jest.fn(),
    emitToUser: jest.fn(),
    getServer: jest.fn().mockReturnValue({ to: () => ({ emit: jest.fn() }) }),
  };
  const notifications = { notifyUser: jest.fn() };
  const supportTickets = {
    getTicketForSocket: jest.fn(),
    isStaffRole: jest.fn(
      (role: string) => role === 'ADMIN' || role === 'MODERATOR',
    ),
    replyAsStaff: jest.fn(),
    replyAsUser: jest.fn(),
  };

  let service: SocketGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SocketGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      notifications as never,
      emitService as never,
      { error: jest.fn() } as never,
      messagingPolicy as never,
      supportTickets as never,
      {
        verifyForSend: jest.fn((_u: string, p: unknown) => Promise.resolve(p)),
        presentMessage: jest.fn((m: unknown) => m),
        presentMessages: jest.fn((m: unknown) => m),
      } as never,
    );
  });

  it('rejects chat:send when sender is not a participant', async () => {
    repo.isThreadParticipant.mockResolvedValue(null);
    const err = await service.handleChatSend(user('eve'), {
      threadId: '11111111-1111-1111-1111-111111111111',
      receiverId: 'bob',
      text: 'hi',
    } as never);
    expect(err?.code).toBe('unauthorized');
    expect(messagingPolicy.assertCanSendMessage).not.toHaveBeenCalled();
  });

  it('rejects chat:send when messaging policy forbids (block/privacy)', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: 't1' });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
    });
    messagingPolicy.assertCanSendMessage.mockRejectedValue(
      new ApiException(403, 'blocked', 'لا يمكنك مراسلة هذا المستخدم'),
    );

    const err = await service.handleChatSend(user('alice'), {
      threadId: '11111111-1111-1111-1111-111111111111',
      receiverId: 'bob',
      text: 'hi',
    } as never);
    expect(err).toEqual({
      code: 'blocked',
      message: 'لا يمكنك مراسلة هذا المستخدم',
    });
    expect(repo.createMessageWithThreadUpdate).not.toHaveBeenCalled();
  });

  it('rejects chat:typing for a non-participant', async () => {
    repo.isThreadParticipant.mockResolvedValue(null);
    const err = await service.handleChatTyping(user('eve'), {
      threadId: '11111111-1111-1111-1111-111111111111',
      receiverId: 'bob',
    });
    expect(err?.code).toBe('unauthorized');
    expect(emitService.getServer).not.toHaveBeenCalled();
  });

  it('rejects chat:typing when parties are blocked', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: 't1' });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
    });
    messagingPolicy.assertNotBlocked.mockRejectedValue(
      new ApiException(403, 'blocked', 'لا يمكنك مراسلة هذا المستخدم'),
    );

    const err = await service.handleChatTyping(user('alice'), {
      threadId: '11111111-1111-1111-1111-111111111111',
      receiverId: 'bob',
    });
    expect(err).toEqual({
      code: 'blocked',
      message: 'لا يمكنك مراسلة هذا المستخدم',
    });
    expect(emitService.getServer).not.toHaveBeenCalled();
  });

  it('rejects chat:typing when receiver is not the other participant', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: 't1' });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: 'bob',
      type: 'DIRECT',
    });

    const err = await service.handleChatTyping(user('alice'), {
      threadId: '11111111-1111-1111-1111-111111111111',
      receiverId: 'stranger',
    });
    expect(err?.code).toBe('unauthorized');
  });

  it('rejects live:join when viewer and host are blocked', async () => {
    repo.findLiveStream = jest.fn().mockResolvedValue({
      id: 'stream-1',
      hostId: 'host',
      viewers: 3,
      likes: 1,
      _count: { comments: 0 },
    });
    repo.incrementStreamViewers = jest.fn();
    messagingPolicy.assertNotBlocked.mockRejectedValue(
      new ApiException(403, 'blocked', 'لا يمكنك مراسلة هذا المستخدم'),
    );

    const err = await service.handleLiveJoin(
      'stream-1',
      user('viewer'),
      jest.fn(),
    );
    expect(err).toEqual({
      code: 'blocked',
      message: 'لا يمكنك مشاهدة بث هذا المستخدم',
    });
    expect(repo.incrementStreamViewers).not.toHaveBeenCalled();
  });

  it('allows live:join when not blocked and increments viewers', async () => {
    repo.findLiveStream = jest.fn().mockResolvedValue({
      id: 'stream-1',
      hostId: 'host',
      viewers: 3,
      likes: 1,
      _count: { comments: 0 },
    });
    repo.incrementStreamViewers = jest.fn().mockResolvedValue({
      viewers: 4,
      peakViewers: 4,
    });
    repo.updatePeakViewers = jest.fn().mockResolvedValue({});
    messagingPolicy.assertNotBlocked.mockResolvedValue(undefined);
    emitService.emitToStream = jest.fn();
    const clientEmit = jest.fn();

    const result = await service.handleLiveJoin(
      'stream-1',
      user('viewer'),
      clientEmit,
    );
    expect(result).toEqual({
      stats: { viewers: 4, likes: 1, commentsCount: 0 },
    });
    expect(messagingPolicy.assertNotBlocked).toHaveBeenCalledWith(
      'viewer',
      'host',
    );
    expect(repo.incrementStreamViewers).toHaveBeenCalledWith('stream-1');
  });

  it('skips block check when the host joins their own stream', async () => {
    repo.findLiveStream = jest.fn().mockResolvedValue({
      id: 'stream-1',
      hostId: 'host',
      viewers: 2,
      likes: 0,
      _count: { comments: 1 },
    });
    repo.incrementStreamViewers = jest.fn();
    emitService.emitToStream = jest.fn();

    const result = await service.handleLiveJoin(
      'stream-1',
      user('host'),
      jest.fn(),
    );
    expect(result).toMatchObject({ stats: { viewers: 2 } });
    expect(messagingPolicy.assertNotBlocked).not.toHaveBeenCalled();
    expect(repo.incrementStreamViewers).not.toHaveBeenCalled();
  });

  it('rejects support:join when the customer does not own the ticket', async () => {
    supportTickets.getTicketForSocket.mockResolvedValue(null);
    const err = await service.handleSupportJoin(
      user('eve'),
      '22222222-2222-2222-2222-222222222222',
    );
    expect(err?.code).toBe('unauthorized');
  });

  it('rejects support:send when the customer does not own the ticket', async () => {
    supportTickets.getTicketForSocket.mockResolvedValue(null);
    const err = await service.handleSupportSend(user('eve'), {
      ticketId: '22222222-2222-2222-2222-222222222222',
      body: 'hi',
    });
    expect(err?.code).toBe('unauthorized');
    expect(supportTickets.replyAsUser).not.toHaveBeenCalled();
  });

  it('allows support:send for the ticket owner without opening direct chat', async () => {
    supportTickets.getTicketForSocket.mockResolvedValue({ id: 't1' });
    supportTickets.replyAsUser.mockResolvedValue({});
    const err = await service.handleSupportSend(user('alice'), {
      ticketId: '22222222-2222-2222-2222-222222222222',
      body: 'تحديث',
    });
    expect(err).toBeNull();
    expect(supportTickets.replyAsUser).toHaveBeenCalled();
    expect(repo.createMessageWithThreadUpdate).not.toHaveBeenCalled();
  });
});
