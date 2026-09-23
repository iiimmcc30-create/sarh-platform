import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from '@/lib/socket';

type OrderSocketPayload = {
  orderId?: string;
};

export function useOrderSocket(
  accessToken: string | null | undefined,
  orderId: string | undefined,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!accessToken) return undefined;
    const socket: Socket = connectSocket(accessToken);

    const handle = (payload?: OrderSocketPayload) => {
      if (!orderId) {
        onChangeRef.current();
        return;
      }
      if (!payload?.orderId || payload.orderId === orderId) {
        onChangeRef.current();
      }
    };

    socket.on('order.updated', handle);
    socket.on('order.cancelled', handle);
    socket.on('order.timeline.updated', handle);
    socket.on('order:updated', handle);
    socket.on('inventory.updated', handle);

    return () => {
      socket.off('order.updated', handle);
      socket.off('order.cancelled', handle);
      socket.off('order.timeline.updated', handle);
      socket.off('order:updated', handle);
      socket.off('inventory.updated', handle);
      socket.disconnect();
    };
  }, [accessToken, orderId]);
}
