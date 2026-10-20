import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/services/api';
import {
  HLS_PREPARE_CLIENT_TIMEOUT_MS,
  pollDelayMs,
  viewerReducer,
  type ViewerEvent,
  type ViewerPhase,
} from '@/lib/liveViewerMode';

interface Options {
  streamId: string | undefined;
  accessToken: string | null;
  /** Join WebRTC with the credentials the backend returned for this session. May throw. */
  joinWebRtc: (data: Record<string, unknown>) => Promise<void>;
  enabled?: boolean;
}

/**
 * Drives one viewer session through WebRTC / HLS-preparing / HLS / failed / waiting-for-slot.
 * The server decides (per session) which path the viewer gets; this hook only reacts and polls.
 */
export function useLiveViewerAccess({ streamId, accessToken, joinWebRtc, enabled = true }: Options) {
  const [phase, setPhase] = useState<ViewerPhase>({ kind: 'connecting' });
  const joinRef = useRef(joinWebRtc);
  joinRef.current = joinWebRtc;
  const busy = useRef(false);

  const dispatch = useCallback((event: ViewerEvent) => {
    setPhase((p) => viewerReducer(p, event));
  }, []);

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const attempt = useCallback(async () => {
    if (!streamId || !accessToken || busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`${API_BASE}/api/livestreams/${streamId}?action=token`, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        dispatch({ type: 'token_error', status: res.status, error: json?.error, details: json?.details });
        return;
      }
      const data = json.data ?? {};
      if (data.mode === 'hls') {
        dispatch({ type: 'token_ok', data });
        return;
      }
      try {
        await joinRef.current(data);
        dispatch({ type: 'token_ok', data });
      } catch {
        // LiveKit refused the join (room limit hit between token and connect): treat as full.
        dispatch({ type: 'token_error', status: 503, error: 'room_full' });
      }
    } catch {
      dispatch({ type: 'token_error', status: 0 });
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, accessToken, dispatch]);

  const pollHls = useCallback(async () => {
    if (!streamId || !accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/livestreams/${streamId}?action=hls-status`, { headers });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        dispatch({
          type: 'hls_status',
          state: json.data.state,
          hlsUrl: json.data.hlsUrl,
          latencySeconds: json.data.latencySeconds,
          reason: json.data.reason,
        });
      } else if (res.status === 410 || res.status === 404) {
        dispatch({ type: 'ended' });
      }
    } catch {
      // transient network error: the next poll (or the client timeout) decides
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, accessToken, dispatch]);

  useEffect(() => {
    if (!enabled || phase.kind !== 'connecting') return;
    void attempt();
  }, [enabled, phase.kind, attempt]);

  useEffect(() => {
    if (!enabled) return;
    const delay = pollDelayMs(phase);
    if (delay === null) return;
    const timer = setInterval(() => {
      if (phase.kind === 'hls_preparing') void pollHls();
      else if (phase.kind === 'waiting_slot') void attempt();
    }, delay);
    return () => clearInterval(timer);
  }, [enabled, phase, attempt, pollHls]);

  useEffect(() => {
    if (!enabled || phase.kind !== 'hls_preparing') return;
    const remaining = Math.max(0, phase.since + HLS_PREPARE_CLIENT_TIMEOUT_MS - Date.now());
    const timer = setTimeout(() => dispatch({ type: 'hls_prepare_timeout' }), remaining);
    return () => clearTimeout(timer);
  }, [enabled, phase, dispatch]);

  return {
    phase,
    retry: () => dispatch({ type: 'retry' }),
    onHlsPlayerError: () => dispatch({ type: 'hls_player_error' }),
    onEnded: () => dispatch({ type: 'ended' }),
  };
}
