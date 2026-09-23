import {
  applyChatSocketEvent,
  attachChatThreadListener,
  mergeChatMessages,
  type ChatSocketLike,
} from '@/lib/chatRealtime';
import type { ChatMessage } from '@/services/chatMessages';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage {
  return {
    senderId: 'me',
    receiverId: 'peer',
    text: 'hi',
    createdAt: '2026-08-31T00:00:00.000Z',
    read: false,
    ...partial,
  };
}

function fakeSocket(): ChatSocketLike & {
  joins: string[];
  leaves: string[];
  handlers: Map<string, Set<(payload: unknown) => void>>;
} {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    joins: [],
    leaves: [],
    handlers,
    emit(event, ...args) {
      if (event === 'chat:join') this.joins.push(String(args[0]));
      if (event === 'chat:leave') this.leaves.push(String(args[0]));
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
  };
}

describe('H4 chat realtime', () => {
  const threadId = 'thread-1';

  it('registers a chat:message listener and joins the thread', () => {
    const socket = fakeSocket();
    const received: unknown[] = [];
    attachChatThreadListener(socket, threadId, (p) => received.push(p));
    expect(socket.joins).toEqual([threadId]);
    expect(socket.handlers.get('chat:message')?.size).toBe(1);
  });

  it('cleans up listener and leaves the thread', () => {
    const socket = fakeSocket();
    const detach = attachChatThreadListener(socket, threadId, () => {});
    detach();
    expect(socket.leaves).toEqual([threadId]);
    expect(socket.handlers.get('chat:message')?.size).toBe(0);
  });

  it('adds a message for the same thread', () => {
    const next = applyChatSocketEvent(
      [],
      { id: 'm1', senderId: 'a', receiverId: 'b', text: 'x', threadId, createdAt: 't' },
      threadId,
    );
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });

  it('ignores a message for a different thread', () => {
    const next = applyChatSocketEvent(
      [],
      { id: 'm2', senderId: 'a', receiverId: 'b', text: 'x', threadId: 'other', createdAt: 't' },
      threadId,
    );
    expect(next).toEqual([]);
  });

  it('ignores a duplicate message id', () => {
    const existing = [msg({ id: 'm1', text: 'x' })];
    const next = mergeChatMessages(existing, msg({ id: 'm1', text: 'x-dup' }));
    expect(next).toHaveLength(1);
    expect(next[0].text).toBe('x');
  });

  it('does not duplicate REST response + socket event', () => {
    const afterRest = mergeChatMessages(
      [msg({ id: 'temp_1', text: 'hello' })],
      msg({ id: 'real-1', text: 'hello' }),
    );
    expect(afterRest.map((m) => m.id)).toEqual(['real-1']);
    const afterSocket = applyChatSocketEvent(
      afterRest,
      { id: 'real-1', senderId: 'me', receiverId: 'peer', text: 'hello', threadId, createdAt: 't' },
      threadId,
    );
    expect(afterSocket).toHaveLength(1);
    expect(afterSocket[0].id).toBe('real-1');
  });
});
