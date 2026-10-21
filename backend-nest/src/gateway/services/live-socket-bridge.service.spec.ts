import { LiveSocketBridgeListenerService } from './live-socket-bridge-listener.service';
import {
  isValidLiveEmit,
  LiveSocketBridgeService,
} from './live-socket-bridge.service';
import { SocketEmitService } from './socket-emit.service';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('live socket bridge', () => {
  it('accepts only live viewer/ended events to stream rooms', () => {
    expect(
      isValidLiveEmit({ room: `stream:${ID}`, event: 'live:viewers', data: 3 }),
    ).toBe(true);
    expect(
      isValidLiveEmit({
        room: `stream:${ID}`,
        event: 'live:ended',
        data: { endedAt: '2026-01-01T00:00:00.000Z' },
      }),
    ).toBe(true);
    expect(
      isValidLiveEmit({ room: `user:${ID}`, event: 'live:viewers', data: 1 }),
    ).toBe(false);
    expect(
      isValidLiveEmit({
        room: `stream:${ID}`,
        event: 'live:comment',
        data: {},
      }),
    ).toBe(false);
    expect(
      isValidLiveEmit({
        room: `council:${ID}`,
        event: 'council:speakers',
        data: {},
      }),
    ).toBe(false);
  });

  it('emits locally when the socket server is in-process', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const emitService = new SocketEmitService();
    emitService.setServer({ to } as never);
    const bridge = new LiveSocketBridgeService(emitService, {
      warn: jest.fn(),
    } as never);
    bridge.toStream(ID, 'live:viewers', 4);
    expect(to).toHaveBeenCalledWith(`stream:${ID}`);
    expect(emit).toHaveBeenCalledWith('live:viewers', 4);
  });

  it('listener drops invalid payloads', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const emitService = new SocketEmitService();
    emitService.setServer({ to } as never);
    const listener = new LiveSocketBridgeListenerService(emitService, {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never);
    listener.handle('not-json');
    listener.handle(
      JSON.stringify({ room: `user:${ID}`, event: 'live:viewers' }),
    );
    listener.handle(
      JSON.stringify({ room: `stream:${ID}`, event: 'live:viewers', data: 2 }),
    );
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('live:viewers', 2);
  });
});
