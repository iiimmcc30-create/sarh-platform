import { SupportSocketBridgeListenerService } from './support-socket-bridge-listener.service';
import {
  SupportSocketBridgeService,
  isValidSupportEmit,
} from './support-socket-bridge.service';
import { SocketEmitService } from './socket-emit.service';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('support socket bridge', () => {
  it('accepts only a ticket uuid and never a message body', () => {
    expect(isValidSupportEmit({ ticketId: ID })).toBe(true);
    expect(isValidSupportEmit({ ticketId: ID, body: 'سر المحادثة' })).toBe(
      true,
    );
    expect(isValidSupportEmit({ ticketId: 'SRH-2026-000001' })).toBe(false);
    expect(isValidSupportEmit({ ticketId: '../other' })).toBe(false);
    expect(isValidSupportEmit(null)).toBe(false);
  });

  function fakeServer() {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    return { server: { to } as never, to, emit };
  }

  it('emits a ticket-id ping inside the socket process, without the body', () => {
    const emitService = new SocketEmitService();
    const { server, to, emit } = fakeServer();
    emitService.setServer(server);
    const bridge = new SupportSocketBridgeService(emitService, {
      warn: jest.fn(),
    } as never);
    bridge.notify(ID);
    expect(to).toHaveBeenCalledWith(`support:${ID}`);
    expect(emit).toHaveBeenCalledWith('support:message', { ticketId: ID });
    expect(JSON.stringify(emit.mock.calls)).not.toContain('body');
  });

  it('listener re-emits a valid ping and drops forged payloads', () => {
    const emitService = new SocketEmitService();
    const { server, to, emit } = fakeServer();
    emitService.setServer(server);
    const listener = new SupportSocketBridgeListenerService(
      emitService,
      {} as never,
    );
    listener.handle(JSON.stringify({ ticketId: ID, body: 'لا ترسل هذا' }));
    expect(to).toHaveBeenCalledWith(`support:${ID}`);
    expect(emit).toHaveBeenCalledWith('support:message', { ticketId: ID });
    emit.mockClear();
    listener.handle(JSON.stringify({ ticketId: 'not-a-uuid', body: 'x' }));
    listener.handle('not-json');
    expect(emit).not.toHaveBeenCalled();
  });
});
