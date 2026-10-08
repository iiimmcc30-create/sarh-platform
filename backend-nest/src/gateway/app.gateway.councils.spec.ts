import 'reflect-metadata';
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';
import { AppGateway } from './app.gateway';

const COUNCIL = '3f2a9f0e-6b1c-4c2e-9f53-1f0b6f4d8a11';
const USER = '9b7a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

function setup() {
  const socketService = {
    authenticate: jest.fn().mockResolvedValue({ userId: USER, role: 'USER' }),
    onUserConnected: jest.fn().mockResolvedValue(undefined),
    onUserDisconnected: jest.fn(),
    parseUuid: (v: unknown) =>
      typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : null,
  };
  const councils = {
    socketJoinError: jest.fn().mockResolvedValue(null),
    touch: jest.fn().mockResolvedValue(undefined),
    emitListenerCount: jest.fn().mockResolvedValue(undefined),
    left: jest.fn().mockResolvedValue(undefined),
    announceArrival: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const gateway = new AppGateway(
    socketService as never,
    {} as never,
    {} as never,
    logger as never,
    councils as never,
  );
  const handlers = new Map<string, (raw: unknown) => void>();
  const client = {
    id: 's1',
    connected: true,
    data: {} as Record<string, unknown>,
    on: jest.fn((event: string, fn: (raw: unknown) => void) => {
      handlers.set(event, fn);
    }),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
  };
  return { gateway, client, handlers, councils, socketService };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AppGateway «المجالس» socket handlers', () => {
  it('are raw listeners, not @SubscribeMessage (global HTTP guards break ws)', () => {
    const proto = AppGateway.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(MESSAGE_METADATA, proto.onPresencePing)).toBe(
      'presence:ping',
    );
    for (const m of ['onCouncilJoin', 'onCouncilLeave', 'onCouncilHeartbeat']) {
      expect(Reflect.getMetadata(MESSAGE_METADATA, proto[m])).toBeUndefined();
    }
  });

  it('binds on connection and joins the council room after handshake auth', async () => {
    const { gateway, client, handlers, councils } = setup();
    await gateway.handleConnection(client as never);
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'council:join',
        'council:leave',
        'council:heartbeat',
      ]),
    );
    handlers.get('council:join')!(COUNCIL);
    await flush();
    await flush();
    expect(councils.socketJoinError).toHaveBeenCalledWith(COUNCIL, USER);
    expect(client.join).toHaveBeenCalledWith(`council:${COUNCIL}`);
    expect(client.emit).toHaveBeenCalledWith('council:joined', {
      councilId: COUNCIL,
    });
    expect(councils.announceArrival).toHaveBeenCalledWith(COUNCIL, USER);

    handlers.get('council:leave')!({ councilId: COUNCIL });
    await flush();
    expect(councils.left).toHaveBeenCalledWith(COUNCIL, USER);
  });

  it('refuses members that the server rejects and ignores bad ids', async () => {
    const { gateway, client, handlers, councils } = setup();
    councils.socketJoinError.mockResolvedValueOnce({
      code: 'council_banned',
      message: 'Banned',
    });
    await gateway.handleConnection(client as never);
    handlers.get('council:join')!(COUNCIL);
    await flush();
    await flush();
    expect(client.join).not.toHaveBeenCalledWith(`council:${COUNCIL}`);
    expect(client.emit).toHaveBeenCalledWith(
      'council:error',
      expect.objectContaining({ code: 'council_banned' }),
    );
    handlers.get('council:heartbeat')!('not-a-uuid');
    await flush();
    expect(councils.touch).not.toHaveBeenCalled();
  });

  it('caps council messages per socket', async () => {
    const { gateway, client, handlers, councils } = setup();
    await gateway.handleConnection(client as never);
    for (let i = 0; i < 30; i++) handlers.get('council:join')!(COUNCIL);
    await flush();
    await flush();
    expect(councils.socketJoinError).toHaveBeenCalledTimes(20);
  });
});
