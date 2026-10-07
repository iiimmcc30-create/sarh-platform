// «المجالس» — who is speaking right now (pure helpers, no React / Agora imports).
//
// Agora's onAudioVolumeIndication fires twice per interval: once for the local user
// (uid 0) and once for remote users. Each callback only describes its own side, so we
// keep a "last loud at" time per uid and derive the speaking set from it. A short hold
// keeps the indicator steady between words instead of flickering every interval.

/** Agora volume is 0–255; quiet room noise sits well below this. */
export const COUNCIL_SPEAKING_VOLUME = 10;
/** How often Agora reports volumes (ms). */
export const COUNCIL_VOLUME_INTERVAL_MS = 250;
/** Keep "speaking" this long after the last loud sample (ms). */
export const COUNCIL_SPEAKING_HOLD_MS = 700;

export type VolumeSample = { uid?: number; volume?: number };
export type LastLoudMap = Readonly<Record<number, number>>;

export type SpeakingUpdate = {
  lastLoud: Record<number, number>;
  /** Sorted speaking uids (0 = me). */
  speaking: number[];
};

/** Uids still within the hold window, sorted. */
export function speakingFrom(lastLoud: LastLoudMap, now: number): number[] {
  return Object.keys(lastLoud)
    .map(Number)
    .filter((uid) => now - lastLoud[uid] <= COUNCIL_SPEAKING_HOLD_MS)
    .sort((a, b) => a - b);
}

/**
 * Folds one volume callback into the state. My own uid (0) never counts while my mic
 * is muted (Agora still measures the local mic when muted).
 */
export function updateSpeaking(
  prev: LastLoudMap,
  samples: readonly VolumeSample[] | undefined,
  now: number,
  localMuted: boolean,
): SpeakingUpdate {
  const lastLoud: Record<number, number> = {};
  for (const key of Object.keys(prev)) {
    const uid = Number(key);
    if (now - prev[uid] <= COUNCIL_SPEAKING_HOLD_MS) lastLoud[uid] = prev[uid];
  }
  if (localMuted) delete lastLoud[0];
  for (const s of samples ?? []) {
    const uid = s.uid ?? 0;
    if ((s.volume ?? 0) < COUNCIL_SPEAKING_VOLUME) continue;
    if (uid === 0 && localMuted) continue;
    lastLoud[uid] = now;
  }
  return { lastLoud, speaking: speakingFrom(lastLoud, now) };
}

type SpeakerLike = { userId: string; agoraUid?: number | null; micMuted: boolean; mutedByModerator?: boolean };
type MeLike = { userId: string; onStage: boolean; micMuted: boolean; mutedByModerator?: boolean };

/**
 * Maps speaking Agora uids to council user ids. uid 0 is me (only while I'm on stage;
 * my own mute state is the freshest source for that). Muted speakers are never
 * "speaking", whatever the audio says.
 */
export function speakingUserIdsFor(
  uids: readonly number[],
  speakers: readonly SpeakerLike[],
  me: MeLike,
): Set<string> {
  const set = new Set<string>();
  for (const uid of uids) {
    if (uid === 0) {
      if (me.onStage && !me.micMuted && !me.mutedByModerator) set.add(me.userId);
      continue;
    }
    const s = speakers.find((sp) => sp.agoraUid === uid);
    if (s && !s.micMuted && !s.mutedByModerator) set.add(s.userId);
  }
  return set;
}
