// Viewer-side state machine for video live: WebRTC, or the CDN-backed HLS fallback when WebRTC is full.
// Pure and framework-free so every transition is unit-tested (see __tests__/live-viewer-mode.test.ts).

export type HlsServerState = 'off' | 'preparing' | 'ready' | 'failed';

export type ViewerPhase =
  | { kind: 'connecting' }
  | { kind: 'webrtc' }
  | { kind: 'hls_preparing'; since: number }
  | { kind: 'hls'; url: string; latencySeconds: number }
  | { kind: 'hls_failed'; reason: string }
  | { kind: 'waiting_slot'; hlsFailed: boolean }
  | { kind: 'ended' }
  | { kind: 'error'; message: string };

export interface TokenData {
  mode?: 'webrtc' | 'hls';
  hlsUrl?: string | null;
  hlsLatencySeconds?: number | null;
}

export type ViewerEvent =
  | { type: 'token_ok'; data: TokenData }
  | { type: 'token_error'; status: number; error?: string; details?: { hlsState?: HlsServerState; reason?: string | null } }
  | { type: 'hls_status'; state: HlsServerState; hlsUrl?: string | null; latencySeconds?: number; reason?: string | null }
  | { type: 'hls_player_error' }
  | { type: 'hls_prepare_timeout' }
  | { type: 'retry' }
  | { type: 'ended' };

export const DEFAULT_HLS_LATENCY_SECONDS = 10;
/** Client-side ceiling for "preparing"; the server enforces its own (HLS_READY_TIMEOUT_SECONDS). */
export const HLS_PREPARE_CLIENT_TIMEOUT_MS = 70_000;

export function viewerReducer(phase: ViewerPhase, event: ViewerEvent, now = Date.now()): ViewerPhase {
  if (phase.kind === 'ended') return phase;
  switch (event.type) {
    case 'ended':
      return { kind: 'ended' };
    case 'retry':
      return phase.kind === 'hls_failed' || phase.kind === 'error' || phase.kind === 'waiting_slot'
        ? { kind: 'connecting' }
        : phase;
    case 'token_ok': {
      if (event.data.mode === 'hls') {
        // Never trust "hls" without a playlist: that would be a black screen.
        if (!event.data.hlsUrl) return { kind: 'hls_preparing', since: now };
        return {
          kind: 'hls',
          url: event.data.hlsUrl,
          latencySeconds: event.data.hlsLatencySeconds ?? DEFAULT_HLS_LATENCY_SECONDS,
        };
      }
      return { kind: 'webrtc' };
    }
    case 'token_error': {
      if (event.status === 410) return { kind: 'ended' };
      const hls = event.details?.hlsState;
      if (event.status === 503 && (event.error === 'hls_preparing' || hls === 'preparing')) {
        return phase.kind === 'hls_preparing' ? phase : { kind: 'hls_preparing', since: now };
      }
      if (event.status === 503 && (event.error === 'hls_failed' || hls === 'failed')) {
        return { kind: 'waiting_slot', hlsFailed: true };
      }
      if (event.status === 503 && (event.error === 'room_full' || event.error === 'cluster_full')) {
        return { kind: 'waiting_slot', hlsFailed: false };
      }
      return { kind: 'error', message: 'تعذر الانضمام إلى البث' };
    }
    case 'hls_status': {
      if (phase.kind !== 'hls_preparing') return phase;
      if (event.state === 'ready' && event.hlsUrl) {
        return {
          kind: 'hls',
          url: event.hlsUrl,
          latencySeconds: event.latencySeconds ?? DEFAULT_HLS_LATENCY_SECONDS,
        };
      }
      if (event.state === 'failed') return { kind: 'hls_failed', reason: event.reason ?? 'egress_failed' };
      if (event.state === 'off') return { kind: 'hls_failed', reason: 'egress_stopped' };
      return phase;
    }
    case 'hls_prepare_timeout':
      return phase.kind === 'hls_preparing' ? { kind: 'hls_failed', reason: 'timeout' } : phase;
    case 'hls_player_error':
      return phase.kind === 'hls' ? { kind: 'hls_failed', reason: 'playback_error' } : phase;
    default:
      return phase;
  }
}

export interface PhaseView {
  /** Show a spinner and `message` instead of video. */
  busy: boolean;
  message: string | null;
  /** Visible label while playing (HLS is delayed). */
  badge: string | null;
  showWebRtcVideo: boolean;
  showHlsVideo: boolean;
  canRetry: boolean;
  /** Why WebRTC-only actions are unavailable, when they are. */
  interactionNote: string | null;
}

export function describePhase(phase: ViewerPhase): PhaseView {
  const none: PhaseView = {
    busy: false,
    message: null,
    badge: null,
    showWebRtcVideo: false,
    showHlsVideo: false,
    canRetry: false,
    interactionNote: null,
  };
  switch (phase.kind) {
    case 'connecting':
      return { ...none, busy: true, message: 'جارٍ الانضمام إلى البث...' };
    case 'webrtc':
      return { ...none, showWebRtcVideo: true };
    case 'hls_preparing':
      return {
        ...none,
        busy: true,
        message: 'البث ممتلئ — جارٍ تجهيز المشاهدة عبر الخادم الموزّع، قد يستغرق ذلك لحظات...',
      };
    case 'hls':
      return {
        ...none,
        showHlsVideo: true,
        badge: `بث موزّع — تأخير ~${phase.latencySeconds} ثوانٍ`,
        interactionNote:
          'أنت تشاهد بنسخة مخفّفة بتأخير بسيط؛ التعليقات والإعجابات تعمل فوراً لكنها قد تسبق الصورة.',
      };
    case 'hls_failed':
      return {
        ...none,
        message:
          phase.reason === 'timeout'
            ? 'تعذر تجهيز المشاهدة البديلة في الوقت المناسب.'
            : 'انقطع البث الموزّع أو تعذر تشغيله.',
        canRetry: true,
      };
    case 'waiting_slot':
      return {
        ...none,
        busy: true,
        message: phase.hlsFailed
          ? 'البث ممتلئ والمشاهدة البديلة غير متاحة الآن — سندخلك تلقائياً عند توفر مقعد.'
          : 'البث ممتلئ حالياً — سندخلك تلقائياً عند توفر مقعد.',
        canRetry: true,
      };
    case 'ended':
      return { ...none, message: 'انتهى البث' };
    case 'error':
      return { ...none, message: phase.message, canRetry: true };
  }
}

/** Seconds to wait before the next poll for the current phase (null = no polling). */
export function pollDelayMs(phase: ViewerPhase): number | null {
  if (phase.kind === 'hls_preparing') return 2500;
  if (phase.kind === 'waiting_slot') return 10_000;
  return null;
}
