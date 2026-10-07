// «المجالس» — global listening session rules (pure, no React / Agora imports).
//
// The council's audio + socket live in CouncilSessionProvider at the app root, not in
// the room screen. Leaving the room screen (back gesture, minimise, opening another
// tab) keeps listening; only an explicit «مغادرة», council end, kick/ban, logout or a
// live stream taking the audio engine disconnects.

export type CouncilBlocked = 'ended' | 'banned' | 'kicked' | 'not_found' | null;

/** Mini player row height (docked above the tab bar / at the bottom of the councils list). */
export const COUNCIL_MINI_PLAYER_HEIGHT = 56;
/** Gap between the mini player and what it sits on. */
export const COUNCIL_MINI_PLAYER_GAP = 8;

/** Round «بدء مجلس» button on the councils list (X Spaces style). */
export const COUNCIL_FAB_SIZE = 56;

/**
 * Physical bottom-LEFT in both directions. With I18nManager.swapLeftAndRightInRTL the
 * app's RTL layout maps `right` to the physical left, so RTL uses `right`.
 */
export function councilFabAnchor(rtl: boolean, offset: number): { left: number } | { right: number } {
  return rtl ? { right: offset } : { left: offset };
}

export type ActiveSessionLike = {
  councilId: string | null;
  joined: boolean;
  blocked: CouncilBlocked;
};

/**
 * What opening a room should do with the current session:
 * `reuse`  — same council, still connected: just refresh (no rejoin, audio untouched);
 * `switch` — another council is active: leave it first;
 * `fresh`  — nothing usable: load + join.
 */
export function planCouncilOpen(active: ActiveSessionLike, id: string): 'reuse' | 'switch' | 'fresh' {
  if (!active.councilId) return 'fresh';
  if (active.councilId !== id) return active.joined ? 'switch' : 'fresh';
  return active.joined && !active.blocked ? 'reuse' : 'fresh';
}

/**
 * Room screen lost focus / unmounted (back, minimise, another tab): keep listening.
 * Only a session that is already over (blocked) or never joined (rules declined,
 * join failed) is cleared.
 */
export function sessionActionOnRoomBlur(blocked: CouncilBlocked, joined: boolean): 'keep' | 'reset' {
  return blocked || !joined ? 'reset' : 'keep';
}

export function isMiniPlayerVisible(s: ActiveSessionLike & { hasState: boolean; roomFocused: boolean }): boolean {
  return Boolean(s.councilId && s.joined && s.hasState && !s.blocked && !s.roomFocused);
}

export type LeaveDeps = {
  stopAudio: () => void;
  setMic: (id: string, muted: boolean) => Promise<unknown>;
  leave: (id: string) => Promise<unknown>;
};

/**
 * Explicit leave. Audio stops first and synchronously (so a live stream can take the
 * engine right away); an owner on stage with an open mic is muted server-side before
 * leaving. Network failures never block leaving.
 */
export async function leaveCouncilSession(
  id: string,
  me: { isOwner: boolean; onStage: boolean; micMuted: boolean } | null,
  deps: LeaveDeps,
): Promise<void> {
  deps.stopAudio();
  if (me?.isOwner && me.onStage && !me.micMuted) {
    await deps.setMic(id, true).catch(() => undefined);
  }
  await deps.leave(id).catch(() => undefined);
}

// ─── Live streams vs councils (one native audio engine) ──────────────────────────

let releaser: (() => boolean) | null = null;

/** The provider registers how to drop the active council (returns true if one was active). */
export function registerCouncilReleaser(fn: (() => boolean) | null): void {
  releaser = fn;
}

/** Called by live-stream screens before they touch the engine. */
export function releaseCouncilForLive(): boolean {
  return releaser ? releaser() : false;
}
