import { CouncilSocketBridgeListenerService } from './council-socket-bridge-listener.service';
import {
  CouncilSocketBridgeService,
  isValidCouncilEmit,
} from './council-socket-bridge.service';
import { SocketEmitService } from './socket-emit.service';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('council socket bridge', () => {
  it('accepts only council events to council/user rooms', () => {
    expect(
      isValidCouncilEmit({
        room: `council:${ID}`,
        event: 'council:speakers',
        data: {},
      }),
    ).toBe(true);
    expect(
      isValidCouncilEmit({
        room: `user:${ID}`,
        event: 'council:role',
        data: {},
      }),
    ).toBe(true);
    expect(
      isValidCouncilEmit({
        room: `thread:${ID}`,
        event: 'council:role',
        data: {},
      }),
    ).toBe(false);
    expect(
      isValidCouncilEmit({
        room: `user:${ID}`,
        event: 'chat:message',
        data: {},
      }),
    ).toBe(false);
    expect(
      isValidCouncilEmit({
        room: 'council:*',
        event: 'council:role',
        data: {},
      }),
    ).toBe(false);
    expect(isValidCouncilEmit(null)).toBe(false);
  });

  function fakeServer() {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    return { server: { to } as never, to, emit };
  }

  it('emits directly when running inside the socket process', () => {
    const emitService = new SocketEmitService();
    const { server, to, emit } = fakeServer();
    emitService.setServer(server);
    const bridge = new CouncilSocketBridgeService(emitService, {
      warn: jest.fn(),
    } as never);
    bridge.toCouncil(ID, 'council:ended', { councilId: ID });
    expect(to).toHaveBeenCalledWith(`council:${ID}`);
    expect(emit).toHaveBeenCalledWith('council:ended', { councilId: ID });
  });

  it('listener re-emits valid messages and drops forged ones', () => {
    const emitService = new SocketEmitService();
    const { server, to, emit } = fakeServer();
    emitService.setServer(server);
    const listener = new CouncilSocketBridgeListenerService(
      emitService,
      {} as never,
    );
    listener.handle(
      JSON.stringify({
        room: `user:${ID}`,
        event: 'council:kicked',
        data: { reason: 'banned' },
      }),
    );
    expect(to).toHaveBeenCalledWith(`user:${ID}`);
    expect(emit).toHaveBeenCalledWith('council:kicked', { reason: 'banned' });
    to.mockClear();
    listener.handle('not json');
    listener.handle(
      JSON.stringify({ room: `stream:${ID}`, event: 'council:x', data: 1 }),
    );
    listener.handle(
      JSON.stringify({ room: `user:${ID}`, event: 'live:comment', data: 1 }),
    );
    expect(to).not.toHaveBeenCalled();
  });
});
