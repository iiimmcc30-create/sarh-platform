import { SocketGatewayService } from './socket-gateway.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

const THREAD = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function user(id: string): JwtPayload {
  return { userId: id, username: id, role: 'USER' };
}

describe('SocketGatewayService chat events', () => {
  const repo = {
    isThreadParticipant: jest.fn(),
    findThreadParticipants: jest.fn(),
    createMessageWithThreadUpdate: jest.fn(),
    markMessagesRead: jest.fn(),
  };
  const roomEmit = jest.fn();
  const emitService = {
    emitToThread: jest.fn(),
    emitToUser: jest.fn(),
    getServer: jest.fn().mockReturnValue({ to: () => ({ emit: roomEmit }) }),
  };
  const policy = {
    assertCanSendMessage: jest.fn(),
    assertNotBlocked: jest.fn(),
    isThreadMuted: jest.fn().mockResolvedValue(false),
  };
  const notifications = { notifyUser: jest.fn() };
  let service: SocketGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.markMessagesRead.mockResolvedValue({ count: 1 });
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
      {
        verifyForSend: jest.fn((_u: string, p: unknown) => Promise.resolve(p)),
        presentMessage: jest.fn((m: unknown) => m),
        presentMessages: jest.fn((m: unknown) => m),
      } as never,
    );
  });

  it('denies chat:join for a non-participant', async () => {
    repo.isThreadParticipant.mockResolvedValue(null);
    expect(await service.handleChatJoin(THREAD, 'eve')).toMatchObject({
      code: 'unauthorized',
    });
  });

  it('allows chat:join for a participant', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: THREAD });
    expect(await service.handleChatJoin(THREAD, 'alice')).toBeNull();
  });

  it('denies chat:read for a non-participant (no DB write, no room broadcast)', async () => {
    repo.isThreadParticipant.mockResolvedValue(null);
    const err = await service.handleChatRead(user('eve'), {
      threadId: THREAD,
      messageIds: [],
    });
    expect(err).toMatchObject({ code: 'unauthorized' });
    expect(repo.markMessagesRead).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('broadcasts chat:read for a participant', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: THREAD });
    expect(
      await service.handleChatRead(user('alice'), {
        threadId: THREAD,
        messageIds: [],
      }),
    ).toBeNull();
    expect(roomEmit).toHaveBeenCalledWith('chat:read', {
      threadId: THREAD,
      readBy: 'alice',
    });
  });

  it('sends a VOICE message over the socket and emits chat:message + notification', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: THREAD });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: BOB,
    });
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    repo.createMessageWithThreadUpdate.mockResolvedValue([
      {
        id: 'm1',
        type: 'VOICE',
        audioUrl: 'https://cdn.x/v.webm',
        mediaDurationMs: 2000,
        sender: { arabicName: 'أ', username: 'alice', avatar: null },
      },
    ]);
    const err = await service.handleChatSend(user('alice'), {
      threadId: THREAD,
      receiverId: BOB,
      audioUrl: 'https://cdn.x/v.webm',
      durationMs: 2000,
    } as never);
    expect(err).toBeNull();
    expect(repo.createMessageWithThreadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VOICE', mediaDurationMs: 2000 }),
    );
    expect(emitService.emitToThread).toHaveBeenCalledWith(
      THREAD,
      'chat:message',
      expect.objectContaining({ type: 'VOICE' }),
    );
    expect(emitService.emitToUser).toHaveBeenCalledWith(
      BOB,
      'chat:notification',
      expect.objectContaining({ preview: '🎤 رسالة صوتية' }),
    );
  });

  it('rejects a socket voice send without duration before persisting', async () => {
    repo.isThreadParticipant.mockResolvedValue({ id: THREAD });
    repo.findThreadParticipants.mockResolvedValue({
      participant1: 'alice',
      participant2: BOB,
    });
    policy.assertCanSendMessage.mockResolvedValue(undefined);
    const err = await service.handleChatSend(user('alice'), {
      threadId: THREAD,
      receiverId: BOB,
      audioUrl: 'https://cdn.x/v.webm',
    } as never);
    expect(err).toMatchObject({ code: 'invalid_input' });
    expect(repo.createMessageWithThreadUpdate).not.toHaveBeenCalled();
  });
});
