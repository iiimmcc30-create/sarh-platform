// «المجالس» background audio bridge (local native module `modules/council-audio`).
//
// Android: a foreground service with an ongoing notification (council title, «مغادرة»,
// tap opens the room) keeps the process — and the Agora engine in it — alive with the app
// in the background or the screen off. Type: mediaPlayback while listening, + microphone
// only while on stage. iOS: UIBackgroundModes=audio keeps the session; the module only
// reports audio interruptions (calls/Siri) so the engine can resume afterwards.
//
// Everything here no-ops when the native module is missing (older builds / dev clients
// without it): nothing throws and the v1 behaviour (auto-mute on background) stays.
import type { CouncilAudioStatus } from '@/hooks/useCouncilAudio';
import type { CouncilBlocked } from '@/lib/councilSession';

export type CouncilLeaveEvent = { councilId?: string; reason?: string };
export type CouncilInterruptionEvent = { phase?: 'began' | 'ended' | string };

type Subscription = { remove: () => void };

export type CouncilAudioNative = {
  sync: (councilId: string, title: string, text: string, onStage: boolean, url: string) => boolean;
  stop: () => unknown;
  isMicCaptureAllowed: () => boolean;
  addListener?: {
    (event: 'onLeave', listener: (e: CouncilLeaveEvent) => void): Subscription;
    (event: 'onInterruption', listener: (e: CouncilInterruptionEvent) => void): Subscription;
  };
};

export const COUNCIL_AUDIO_MODULE = 'CouncilAudio';
export const COUNCIL_APP_SCHEME = 'sarh';

let override: CouncilAudioNative | null | undefined;

/** The native module, or null on builds that don't ship it. Never throws. */
export function getCouncilAudioNative(): CouncilAudioNative | null {
  if (override !== undefined) return override;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require('expo') as { requireOptionalNativeModule?: (name: string) => unknown };
    const mod = expo.requireOptionalNativeModule?.(COUNCIL_AUDIO_MODULE) as CouncilAudioNative | null | undefined;
    return mod && typeof mod.sync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

/** Tests only. `undefined` restores the real lookup. */
export function __setCouncilAudioNativeForTests(mod: CouncilAudioNative | null | undefined): void {
  override = mod;
}

/** Deep link the notification opens (expo-router: /councils/[id]). */
export function councilRoomUrl(councilId: string): string {
  return `${COUNCIL_APP_SCHEME}://councils/${encodeURIComponent(councilId)}`;
}

export const COUNCIL_NOTIFICATION_LISTENING = 'تستمع إلى المجلس الآن';
export const COUNCIL_NOTIFICATION_MIC_OPEN = 'أنت على المنصة · الميكروفون مفتوح';
export const COUNCIL_NOTIFICATION_MIC_CLOSED = 'أنت على المنصة · الميكروفون مغلق';
export const COUNCIL_NOTIFICATION_DEFAULT_TITLE = 'مجلس صوتي';

export function councilNotificationText(onStage: boolean, micMuted: boolean): string {
  if (!onStage) return COUNCIL_NOTIFICATION_LISTENING;
  return micMuted ? COUNCIL_NOTIFICATION_MIC_CLOSED : COUNCIL_NOTIFICATION_MIC_OPEN;
}

const LIVE_AUDIO: CouncilAudioStatus[] = ['connecting', 'connected', 'reconnecting'];

export type BackgroundAudioInput = {
  councilId: string | null;
  joined: boolean;
  blocked: CouncilBlocked;
  audioStatus: CouncilAudioStatus;
  title: string | null | undefined;
  onStage: boolean;
  micMuted: boolean;
};

export type BackgroundAudioPlan =
  | { kind: 'stop' }
  | { kind: 'run'; councilId: string; title: string; text: string; onStage: boolean; url: string };

/** Service runs only while the council audio is actually live. */
export function planBackgroundAudio(input: BackgroundAudioInput): BackgroundAudioPlan {
  if (!input.councilId || !input.joined || input.blocked || !LIVE_AUDIO.includes(input.audioStatus)) {
    return { kind: 'stop' };
  }
  const title = input.title?.trim() || COUNCIL_NOTIFICATION_DEFAULT_TITLE;
  return {
    kind: 'run',
    councilId: input.councilId,
    title,
    text: councilNotificationText(input.onStage, input.micMuted),
    onStage: input.onStage,
    url: councilRoomUrl(input.councilId),
  };
}

export function backgroundAudioKey(plan: BackgroundAudioPlan): string {
  if (plan.kind === 'stop') return 'stop';
  return [plan.councilId, plan.title, plan.text, plan.onStage ? 1 : 0].join('|');
}

/**
 * Applies a plan to the native side; returns the key now in effect. Skips duplicates
 * (pass `force` to re-apply, e.g. on resume to upgrade the service type). Never throws.
 */
export function applyBackgroundAudio(
  native: CouncilAudioNative | null,
  plan: BackgroundAudioPlan,
  prevKey: string,
  force = false,
): string {
  const key = backgroundAudioKey(plan);
  if (!native) return key;
  if (key === prevKey && !force) return key;
  try {
    if (plan.kind === 'stop') {
      // '' = first run after (re)load: also clears a service left over from a JS reload.
      if (prevKey !== 'stop') native.stop();
    } else {
      native.sync(plan.councilId, plan.title, plan.text, plan.onStage, plan.url);
    }
  } catch {
    // native side unavailable — keep going without background support
  }
  return key;
}

/** Notification «مغادرة» / app swiped away: leave only the council it was started for. */
export function shouldLeaveFromNative(event: CouncilLeaveEvent | null | undefined, currentId: string | null): boolean {
  if (!currentId) return false;
  const id = event?.councilId;
  return !id || id === currentId;
}

/** Can the mic keep capturing with the app in the background? False → auto-mute (v1). */
export function micCaptureAllowedInBackground(native: CouncilAudioNative | null): boolean {
  if (!native) return false;
  try {
    return native.isMicCaptureAllowed() === true;
  } catch {
    return false;
  }
}

export function shouldAutoMuteOnBackground(input: {
  onStage: boolean;
  micMuted: boolean;
  micCaptureAllowed: boolean;
}): boolean {
  return input.onStage && !input.micMuted && !input.micCaptureAllowed;
}

/** Subscribes safely; returns a no-op remover when events aren't available. */
export function subscribeCouncilAudio(
  native: CouncilAudioNative | null,
  handlers: { onLeave?: (e: CouncilLeaveEvent) => void; onInterruption?: (e: CouncilInterruptionEvent) => void },
): () => void {
  if (!native?.addListener) return () => undefined;
  const subs: Subscription[] = [];
  try {
    if (handlers.onLeave) subs.push(native.addListener('onLeave', handlers.onLeave));
    if (handlers.onInterruption) subs.push(native.addListener('onInterruption', handlers.onInterruption));
  } catch {
    // ignore — events unsupported on this build
  }
  return () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        // already removed
      }
    }
  };
}
