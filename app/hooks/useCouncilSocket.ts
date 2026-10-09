// «المجالس» realtime channel: joins `council:{id}` on the socket service, keeps a
// presence heartbeat (listener count) and forwards council events to the room screen.
// On every (re)connect the screen resyncs from REST so missed events never stick.
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from '@/lib/socket';
import {
  COUNCIL_HEARTBEAT_MS,
  type CouncilImage,
  type CouncilListener,
  type CouncilMemberRole,
  type CouncilRequest,
  type CouncilSpeaker,
  type CouncilUser,
} from '@/services/councils';

export type CouncilSocketHandlers = {
  /** Fired after (re)joining the room — the screen should refetch state. */
  onResync?: () => void;
  /** `listeners` = first page of the participants grid (older servers omit it). */
  onSpeakers?: (p: {
    speakers: CouncilSpeaker[];
    speakersCount: number;
    listenerCount: number;
    listeners?: CouncilListener[];
    listenersNextCursor?: string | null;
  }) => void;
  onListeners?: (p: {
    listenerCount: number;
    listeners?: CouncilListener[];
    listenersNextCursor?: string | null;
  }) => void;
  /** «عرض صورة»: the pinned image changed (null = removed). */
  onImage?: (p: { image: CouncilImage | null }) => void;
  onMic?: (p: { userId: string; micMuted: boolean; mutedByModerator?: boolean }) => void;
  /** Sent to me only: my role/seat/mute changed. */
  onRole?: (p: {
    role: CouncilMemberRole;
    seatIndex: number | null;
    micMuted: boolean;
    mutedByModerator?: boolean;
  }) => void;
  onKicked?: (p: { reason: 'removed' | 'banned' }) => void;
  onRequestResult?: (p: { requestId: string; status: 'ACCEPTED' | 'REJECTED' | string }) => void;
  onRequests?: (p: { pending: CouncilRequest[] }) => void;
  /** A Gold / Blue+ subscriber entered the room (server-throttled; older servers never send it). */
  onArrival?: (p: { user: CouncilUser }) => void;
  onEnded?: () => void;
  onUpdated?: () => void;
  onError?: (p: { code: string }) => void;
};

type Options = {
  councilId: string | undefined;
  accessToken: string | null;
  enabled: boolean;
  handlers: CouncilSocketHandlers;
};

export function useCouncilSocket({ councilId, accessToken, enabled, handlers }: Options) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled || !councilId || !accessToken) return;
    const socket: Socket = connectSocket(accessToken);
    const h = () => handlersRef.current;

    // Personal events go to `user:{id}` (all my sockets) — keep only this council's.
    const on = <T,>(event: string, fn: (p: T) => void) =>
      socket.on(event, (p: T & { councilId?: string }) => {
        if (p && typeof p === 'object' && p.councilId && p.councilId !== councilId) return;
        fn(p);
      });

    socket.on('connect', () => socket.emit('council:join', councilId));
    on('council:joined', () => h().onResync?.());
    on<Parameters<NonNullable<CouncilSocketHandlers['onSpeakers']>>[0]>('council:speakers', (p) =>
      h().onSpeakers?.(p),
    );
    on<Parameters<NonNullable<CouncilSocketHandlers['onListeners']>>[0]>('council:listeners', (p) =>
      h().onListeners?.(p),
    );
    on<{ image?: CouncilImage | null }>('council:image', (p) => h().onImage?.({ image: p?.image ?? null }));
    on<Parameters<NonNullable<CouncilSocketHandlers['onMic']>>[0]>('council:mic', (p) => h().onMic?.(p));
    on<Parameters<NonNullable<CouncilSocketHandlers['onRole']>>[0]>('council:role', (p) =>
      h().onRole?.(p),
    );
    on<{ reason: 'removed' | 'banned' }>('council:kicked', (p) => h().onKicked?.(p));
    on<{ requestId: string; status: string }>('council:request-result', (p) =>
      h().onRequestResult?.(p),
    );
    on<{ pending: CouncilRequest[] }>('council:requests', (p) => h().onRequests?.(p));
    on<{ user?: CouncilUser }>('council:arrival', (p) => {
      if (p?.user?.id) h().onArrival?.({ user: p.user });
    });
    on('council:ended', () => h().onEnded?.());
    on('council:updated', () => h().onUpdated?.());
    on<{ code: string }>('council:error', (p) => h().onError?.(p));

    const heartbeat = setInterval(() => {
      if (socket.connected) socket.emit('council:heartbeat', councilId);
    }, COUNCIL_HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      if (socket.connected) socket.emit('council:leave', councilId);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [councilId, accessToken, enabled]);
}
