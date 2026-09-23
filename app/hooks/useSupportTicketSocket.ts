import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { attachSupportTicketListener } from '@/lib/supportRealtime';
import { connectSocket } from '@/lib/socket';

export function useSupportTicketSocket(
  accessToken: string | null | undefined,
  ticketId: string | null | undefined,
  onPayload: (payload: unknown) => void,
) {
  const onPayloadRef = useRef(onPayload);
  useEffect(() => {
    onPayloadRef.current = onPayload;
  });

  useEffect(() => {
    if (!accessToken || !ticketId) return undefined;

    const socket: Socket = connectSocket(accessToken);
    const detach = attachSupportTicketListener(socket, ticketId, (payload) => {
      onPayloadRef.current(payload);
    });

    return () => {
      detach();
      socket.disconnect();
    };
  }, [accessToken, ticketId]);
}
