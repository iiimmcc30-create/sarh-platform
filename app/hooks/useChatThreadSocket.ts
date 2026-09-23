import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { attachChatThreadListener } from '@/lib/chatRealtime';
import { connectSocket } from '@/lib/socket';

export function useChatThreadSocket(
  accessToken: string | null | undefined,
  threadId: string | null | undefined,
  onPayload: (payload: unknown) => void,
) {
  const onPayloadRef = useRef(onPayload);
  useEffect(() => {
    onPayloadRef.current = onPayload;
  });

  useEffect(() => {
    if (!accessToken || !threadId) return undefined;

    const socket: Socket = connectSocket(accessToken);
    const detach = attachChatThreadListener(socket, threadId, (payload) => {
      onPayloadRef.current(payload);
    });

    return () => {
      detach();
      socket.disconnect();
    };
  }, [accessToken, threadId]);
}
