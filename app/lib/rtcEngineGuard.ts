// App-wide guard for the single native Agora engine (react-native-agora exposes one
// engine per process). A council only takes the engine while its room screen is
// focused and releases it on blur; it never starts while a live stream is connected.
// useLiveStream is intentionally untouched: live usage is detected from the engine's
// own connection state instead.

export type RtcEngineOwner = 'council';

let owner: { kind: RtcEngineOwner; id: string } | null = null;

export function getRtcEngineOwner() {
  return owner;
}

/** Claims the engine for a council; false if another council already holds it. */
export function claimRtcEngine(kind: RtcEngineOwner, id: string): boolean {
  if (owner && !(owner.kind === kind && owner.id === id)) return false;
  owner = { kind, id };
  return true;
}

export function releaseRtcEngine(kind: RtcEngineOwner, id: string): void {
  if (owner?.kind === kind && owner.id === id) owner = null;
}

/** Agora `ConnectionStateType.ConnectionStateDisconnected`. */
export const AGORA_CONNECTION_DISCONNECTED = 1;
/** Agora `ConnectionStateType.ConnectionStateFailed`. */
export const AGORA_CONNECTION_FAILED = 5;

/**
 * True when the shared engine is already in a channel that the council did not open
 * (i.e. a live stream is playing/broadcasting).
 */
export function isEngineBusyElsewhere(connectionState: number | null | undefined): boolean {
  if (owner) return false;
  if (typeof connectionState !== 'number' || connectionState < 0) return false;
  return (
    connectionState !== AGORA_CONNECTION_DISCONNECTED &&
    connectionState !== AGORA_CONNECTION_FAILED
  );
}
