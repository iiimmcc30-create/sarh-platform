'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

function resolveSocketUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://127.0.0.1:3002';
  return raw.replace('localhost', '127.0.0.1');
}

/**
 * Reuses existing admin Socket.IO auth + support:{ticketId} rooms.
 * Does not create a parallel chat transport.
 */
export function useAdminSupportTicketSocket(
  ticketId: string | null | undefined,
  onMessage: () => void,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (typeof window === 'undefined' || !ticketId) return undefined;
    const token = localStorage.getItem('admin_access_token');
    if (!token) return undefined;

    const socket: Socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    const refresh = () => onMessageRef.current();
    const join = () => {
      socket.emit('support:join', { ticketId });
    };

    socket.on('connect', join);
    if (socket.connected) join();
    socket.on('support:message', refresh);

    return () => {
      socket.emit('support:leave', { ticketId });
      socket.off('connect', join);
      socket.off('support:message', refresh);
      socket.disconnect();
    };
  }, [ticketId]);
}
