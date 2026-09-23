'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

function resolveSocketUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://127.0.0.1:3002';
  return raw.replace('localhost', '127.0.0.1');
}

export function useAdminOrderSocket(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const token = localStorage.getItem('admin_access_token');
    if (!token) return undefined;

    const socket: Socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    const refresh = () => onChangeRef.current();

    socket.on('admin.order.created', refresh);
    socket.on('admin.order.updated', refresh);
    socket.on('admin.order.cancelled', refresh);
    socket.on('admin.inventory.updated', refresh);
    socket.on('order.created', refresh);
    socket.on('order.updated', refresh);
    socket.on('order.cancelled', refresh);
    socket.on('inventory.updated', refresh);

    return () => {
      socket.off('admin.order.created', refresh);
      socket.off('admin.order.updated', refresh);
      socket.off('admin.order.cancelled', refresh);
      socket.off('admin.inventory.updated', refresh);
      socket.off('order.created', refresh);
      socket.off('order.updated', refresh);
      socket.off('order.cancelled', refresh);
      socket.off('inventory.updated', refresh);
      socket.disconnect();
    };
  }, []);
}
