import {
  describePhase,
  pollDelayMs,
  viewerReducer,
  type ViewerPhase,
} from '../lib/liveViewerMode';
import { providerFromCreds } from '../lib/rtcProvider';

const connecting: ViewerPhase = { kind: 'connecting' };
const T = 1_000;

describe('viewer HLS fallback state machine', () => {
  it('WebRTC token -> webrtc', () => {
    expect(viewerReducer(connecting, { type: 'token_ok', data: { mode: 'webrtc' } })).toEqual({ kind: 'webrtc' });
  });

  it('HLS token with a playlist -> hls with the labelled latency', () => {
    const p = viewerReducer(connecting, {
      type: 'token_ok',
      data: { mode: 'hls', hlsUrl: 'https://cdn/x.m3u8', hlsLatencySeconds: 8 },
    });
    expect(p).toEqual({ kind: 'hls', url: 'https://cdn/x.m3u8', latencySeconds: 8 });
    expect(describePhase(p).badge).toContain('8');
    expect(describePhase(p).showHlsVideo).toBe(true);
    expect(describePhase(p).interactionNote).toBeTruthy();
  });

  it('never shows HLS video without a playlist (no black screen): hls token without url = preparing', () => {
    const p = viewerReducer(connecting, { type: 'token_ok', data: { mode: 'hls', hlsUrl: null } }, T);
    expect(p).toEqual({ kind: 'hls_preparing', since: T });
    expect(describePhase(p)).toMatchObject({ busy: true, showHlsVideo: false, showWebRtcVideo: false });
  });

  it('503 hls_preparing -> preparing, polled until ready', () => {
    let p = viewerReducer(
      connecting,
      { type: 'token_error', status: 503, error: 'hls_preparing', details: { hlsState: 'preparing' } },
      T,
    );
    expect(p).toEqual({ kind: 'hls_preparing', since: T });
    expect(pollDelayMs(p)).toBe(2500);
    p = viewerReducer(p, { type: 'hls_status', state: 'preparing' }, T + 1);
    expect(p).toEqual({ kind: 'hls_preparing', since: T });
    p = viewerReducer(p, { type: 'hls_status', state: 'ready', hlsUrl: 'https://cdn/x.m3u8' });
    expect(p).toMatchObject({ kind: 'hls', url: 'https://cdn/x.m3u8' });
  });

  it('ready without a url is not accepted', () => {
    const p: ViewerPhase = { kind: 'hls_preparing', since: T };
    expect(viewerReducer(p, { type: 'hls_status', state: 'ready', hlsUrl: null })).toEqual(p);
  });

  it('egress failure while preparing -> hls_failed with retry', () => {
    const p = viewerReducer(
      { kind: 'hls_preparing', since: T },
      { type: 'hls_status', state: 'failed', reason: 'timeout' },
    );
    expect(p).toEqual({ kind: 'hls_failed', reason: 'timeout' });
    expect(describePhase(p).canRetry).toBe(true);
    expect(viewerReducer(p, { type: 'retry' })).toEqual({ kind: 'connecting' });
  });

  it('egress vanished (state off) while preparing is a failure, not an endless spinner', () => {
    expect(
      viewerReducer({ kind: 'hls_preparing', since: T }, { type: 'hls_status', state: 'off' }),
    ).toMatchObject({ kind: 'hls_failed' });
  });

  it('client-side preparing timeout -> hls_failed', () => {
    expect(viewerReducer({ kind: 'hls_preparing', since: T }, { type: 'hls_prepare_timeout' })).toEqual({
      kind: 'hls_failed',
      reason: 'timeout',
    });
    expect(viewerReducer({ kind: 'webrtc' }, { type: 'hls_prepare_timeout' })).toEqual({ kind: 'webrtc' });
  });

  it('player error while playing HLS -> failed (retry re-requests access)', () => {
    const p = viewerReducer({ kind: 'hls', url: 'u', latencySeconds: 10 }, { type: 'hls_player_error' });
    expect(p).toEqual({ kind: 'hls_failed', reason: 'playback_error' });
  });

  it('room full without HLS, or with failed HLS -> stay on the waitlist and keep polling for a slot', () => {
    const full = viewerReducer(connecting, { type: 'token_error', status: 503, error: 'room_full' });
    expect(full).toEqual({ kind: 'waiting_slot', hlsFailed: false });
    expect(pollDelayMs(full)).toBe(10_000);
    const failed = viewerReducer(connecting, {
      type: 'token_error',
      status: 503,
      error: 'hls_failed',
      details: { hlsState: 'failed' },
    });
    expect(failed).toEqual({ kind: 'waiting_slot', hlsFailed: true });
    expect(describePhase(failed).message).toContain('غير متاحة');
  });

  it('slot frees up while waiting -> WebRTC', () => {
    expect(
      viewerReducer({ kind: 'waiting_slot', hlsFailed: false }, { type: 'token_ok', data: { mode: 'webrtc' } }),
    ).toEqual({ kind: 'webrtc' });
  });

  it('410 = ended; other errors surface a clear retryable error', () => {
    expect(viewerReducer(connecting, { type: 'token_error', status: 410 })).toEqual({ kind: 'ended' });
    const e = viewerReducer(connecting, { type: 'token_error', status: 500 });
    expect(e.kind).toBe('error');
    expect(describePhase(e).canRetry).toBe(true);
  });

  it('ended is terminal', () => {
    expect(viewerReducer({ kind: 'ended' }, { type: 'token_ok', data: { mode: 'webrtc' } })).toEqual({ kind: 'ended' });
  });
});

describe('RTC provider selection in the app (no app update needed to switch)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('the backend answer wins over the build-time default, in both directions', () => {
    process.env.EXPO_PUBLIC_RTC_PROVIDER = 'livekit';
    expect(providerFromCreds({ provider: 'agora', agoraToken: 't' })).toBe('agora');
    process.env.EXPO_PUBLIC_RTC_PROVIDER = 'agora';
    expect(providerFromCreds({ provider: 'livekit', livekitUrl: 'wss://x', livekitToken: 't' })).toBe('livekit');
  });

  it('infers from credentials when the provider field is missing (older backend responses)', () => {
    expect(providerFromCreds({ livekitUrl: 'wss://x', livekitToken: 't' })).toBe('livekit');
    expect(providerFromCreds({ agoraToken: 't' })).toBe('agora');
  });

  it('falls back to the build default only before any credentials exist', () => {
    delete process.env.EXPO_PUBLIC_RTC_PROVIDER;
    expect(providerFromCreds(undefined)).toBe('livekit');
    process.env.EXPO_PUBLIC_RTC_PROVIDER = 'agora';
    expect(providerFromCreds(null)).toBe('agora');
  });
});
