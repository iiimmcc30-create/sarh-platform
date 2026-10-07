// «المجالس» global listening session. Owns the active council's state, Agora audio
// (useCouncilAudio) and realtime socket so listening continues while the user browses
// the app; the room screen and the mini player are views on it.
// Disconnects only on explicit leave, council end, kick/ban, logout or a live stream.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/contexts/AuthContext';
import { useCouncilAudio } from '@/hooks/useCouncilAudio';
import { useCouncilSocket } from '@/hooks/useCouncilSocket';
import {
  applyBackgroundAudio,
  getCouncilAudioNative,
  micCaptureAllowedInBackground,
  planBackgroundAudio,
  shouldAutoMuteOnBackground,
  shouldLeaveFromNative,
  subscribeCouncilAudio,
  type BackgroundAudioPlan,
} from '@/lib/councilBackgroundAudio';
import {
  isMiniPlayerVisible,
  leaveCouncilSession,
  planCouncilOpen,
  registerCouncilReleaser,
  releaseCouncilForLive,
  sessionActionOnRoomBlur,
  type CouncilBlocked,
} from '@/lib/councilSession';
import { speakingUserIdsFor, withMyMicState } from '@/lib/councilSpeaking';
import { ensureMicPermission } from '@/lib/livePermissions';
import { showToast } from '@/lib/toast';
import {
  COUNCIL_BANNED_TEXT,
  COUNCIL_ENDED_TEXT,
  COUNCIL_KICKED_TEXT,
  COUNCIL_RESYNC_MS,
  CouncilApiError,
  councilErrorMessage,
  fetchCouncil,
  fetchCouncilToken,
  joinCouncil,
  leaveCouncil,
  setCouncilMic,
  type CouncilSpeaker,
  type CouncilState,
} from '@/services/councils';

export type CouncilOpenResult = 'joined' | 'rules' | 'blocked' | 'error';

type CouncilAudio = ReturnType<typeof useCouncilAudio>;

export type CouncilSessionValue = {
  councilId: string | null;
  state: CouncilState | null;
  loading: boolean;
  loadError: string | null;
  blocked: CouncilBlocked;
  joined: boolean;
  joining: boolean;
  busy: string | null;
  agoraError: string | null;
  audio: CouncilAudio;
  /** Stage list with my own seat following my local mic state. */
  stageSpeakers: CouncilSpeaker[];
  speakingUserIds: Set<string>;
  miniPlayerVisible: boolean;
  open: (id: string, code: string | null) => Promise<CouncilOpenResult>;
  join: (acceptRules: boolean) => Promise<CouncilOpenResult>;
  refresh: () => Promise<CouncilState | null>;
  setState: Dispatch<SetStateAction<CouncilState | null>>;
  setBlocked: (b: CouncilBlocked) => void;
  setBusy: (b: string | null) => void;
  run: (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  toggleMic: () => Promise<void>;
  /** Explicit «مغادرة»: stop audio, leave server-side, clear the session. */
  leave: () => Promise<void>;
  /** Room screen focus — the mini player hides while the room is on screen. */
  setRoomFocused: (focused: boolean) => void;
};

const CouncilSessionContext = createContext<CouncilSessionValue | null>(null);

/**
 * Android 13+: the foreground-service notification (title, «مغادرة») needs
 * POST_NOTIFICATIONS. Asked once, only if never answered; the service runs either way.
 */
async function ensureCouncilNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'undetermined' && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    // notifications unavailable — background audio still runs
  }
}

const BLOCKED_TEXT: Record<Exclude<CouncilBlocked, null>, string> = {
  ended: COUNCIL_ENDED_TEXT,
  banned: COUNCIL_BANNED_TEXT,
  kicked: COUNCIL_KICKED_TEXT,
  not_found: 'المجلس غير متاح',
};

export function CouncilSessionProvider({ children }: { children: ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();

  const [councilId, setCouncilId] = useState<string | null>(null);
  const [state, setState] = useState<CouncilState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocked, setBlockedState] = useState<CouncilBlocked>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [agoraError, setAgoraError] = useState<string | null>(null);
  const [roomFocused, setRoomFocusedState] = useState(false);

  const idRef = useRef<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const stateRef = useRef<CouncilState | null>(null);
  stateRef.current = state;
  const joinedRef = useRef(false);
  joinedRef.current = joined;
  const blockedRef = useRef<CouncilBlocked>(null);
  blockedRef.current = blocked;
  const roomFocusedRef = useRef(false);

  const audio = useCouncilAudio({
    councilId: councilId ?? undefined,
    requestToken: useCallback(async () => {
      const id = idRef.current;
      if (!id) return null;
      try {
        return await fetchCouncilToken(id);
      } catch (err) {
        if (err instanceof CouncilApiError) handleBlockingError(err);
        return null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onFatal: (reason) => {
      if (reason === 'banned') void refresh();
    },
    onMicDenied: () => void showToast('يجب السماح بالميكروفون للتحدث في المجلس', 'error'),
  });
  const audioRef = useRef(audio);
  audioRef.current = audio;

  // Native background-audio module (null on builds without it → everything no-ops).
  const [bgNative] = useState(() => getCouncilAudioNative());
  const bgKeyRef = useRef('');
  const bgPlanRef = useRef<BackgroundAudioPlan>({ kind: 'stop' });

  const reset = useCallback(() => {
    audioRef.current.stop();
    idRef.current = null;
    codeRef.current = null;
    setCouncilId(null);
    setState(null);
    setJoined(false);
    setBlockedState(null);
    setLoadError(null);
    setAgoraError(null);
    setBusy(null);
  }, []);

  const setBlocked = useCallback((b: CouncilBlocked) => {
    setBlockedState(b);
    if (b) {
      setJoined(false);
      audioRef.current.stop();
    }
  }, []);

  const applyState = useCallback((next: CouncilState) => {
    if (next.council.id !== idRef.current) return;
    setState(next);
    setLoadError(null);
    if (next.council.status === 'ENDED') setBlocked('ended');
    else if (next.me.banned) setBlocked('banned');
    else if (next.me.kickedUntil) setBlocked('kicked');
    else setBlockedState(null);
  }, [setBlocked]);

  function handleBlockingError(err: CouncilApiError): boolean {
    const map: Record<string, CouncilBlocked> = {
      council_ended: 'ended',
      council_banned: 'banned',
      council_kicked: 'kicked',
      not_found: 'not_found',
    };
    const b = map[err.code] ?? (err.status === 404 ? 'not_found' : null);
    if (!b) return false;
    setBlocked(b);
    return true;
  }

  const refresh = useCallback(async () => {
    const id = idRef.current;
    if (!id) return null;
    try {
      const next = await fetchCouncil(id, codeRef.current);
      applyState(next);
      return next;
    } catch (err) {
      if (idRef.current !== id) return null;
      if (err instanceof CouncilApiError && handleBlockingError(err)) return null;
      setLoadError(councilErrorMessage(err));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyState]);

  const join = useCallback(
    async (acceptRules: boolean): Promise<CouncilOpenResult> => {
      const id = idRef.current;
      if (!id) return 'error';
      setJoining(true);
      try {
        const res = await joinCouncil(id, { code: codeRef.current, acceptRules });
        if (idRef.current !== id) return 'error';
        applyState(res.state);
        setJoined(true);
        if (!res.agora) {
          setAgoraError(res.agoraError ?? 'agora_unavailable');
          return 'joined';
        }
        setAgoraError(null);
        await audioRef.current.start(res.agora, res.state.me.micMuted);
        return 'joined';
      } catch (err) {
        if (err instanceof CouncilApiError) {
          if (err.code === 'rules_required') return 'rules';
          if (handleBlockingError(err)) return 'blocked';
        }
        void showToast(councilErrorMessage(err), 'error');
        return 'error';
      } finally {
        setJoining(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyState],
  );

  const leave = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const me = stateRef.current?.me;
    const wasJoined = joinedRef.current;
    const snapshot = me ? { isOwner: me.permissions.isOwner, onStage: me.onStage, micMuted: me.micMuted } : null;
    reset();
    if (!wasJoined) return;
    await leaveCouncilSession(id, snapshot, {
      stopAudio: () => audioRef.current.stop(),
      setMic: setCouncilMic,
      leave: leaveCouncil,
    });
  }, [reset]);

  const open = useCallback(
    async (id: string, code: string | null): Promise<CouncilOpenResult> => {
      const plan = planCouncilOpen({ councilId: idRef.current, joined: joinedRef.current, blocked: blockedRef.current }, id);
      if (plan === 'reuse') {
        void refresh();
        if (audioRef.current.status === 'failed' || audioRef.current.status === 'idle') return join(false);
        return 'joined';
      }
      if (plan === 'switch') await leave();
      if (idRef.current !== id) {
        reset();
        idRef.current = id;
        setCouncilId(id);
      }
      codeRef.current = code;
      setLoading(true);
      const next = await refresh();
      setLoading(false);
      if (idRef.current !== id) return 'error';
      if (!next) return blockedRef.current ? 'blocked' : 'error';
      if (next.council.status !== 'LIVE' || next.me.banned || next.me.kickedUntil) return 'blocked';
      if (!next.me.rulesAccepted) return 'rules';
      return join(false);
    },
    [join, leave, refresh, reset],
  );

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, ok?: string) => {
      setBusy(key);
      try {
        await fn();
        if (ok) void showToast(ok, 'success');
        return true;
      } catch (err) {
        if (!(err instanceof CouncilApiError && handleBlockingError(err))) {
          void showToast(councilErrorMessage(err), 'error');
        }
        void refresh();
        return false;
      } finally {
        setBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh],
  );

  const toggleMic = useCallback(async () => {
    const id = idRef.current;
    const s = stateRef.current;
    if (!id || !s?.me.onStage) return;
    if (s.me.mutedByModerator) {
      void showToast('الميكروفون مكتوم من المشرف', 'info');
      return;
    }
    const nextMuted = !s.me.micMuted;
    const a = audioRef.current;
    if (!nextMuted) {
      if (!(await ensureMicPermission())) {
        void showToast('يجب السماح بالميكروفون للتحدث في المجلس', 'error');
        return;
      }
    } else {
      a.setMuted(true);
    }
    setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: nextMuted } } : prev));
    const ok = await run('mic', async () => {
      await setCouncilMic(id, nextMuted);
      if (!nextMuted) {
        if (!a.isPublisher()) await a.renew();
        a.setMuted(false);
      }
    });
    if (!ok) {
      a.setMuted(true);
      // Unmute failed: don't leave my seat/button showing an open mic.
      if (!nextMuted) setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: true } } : prev));
    }
  }, [run]);

  const setRoomFocused = useCallback(
    (focused: boolean) => {
      roomFocusedRef.current = focused;
      setRoomFocusedState(focused);
      if (!focused && sessionActionOnRoomBlur(blockedRef.current, joinedRef.current) === 'reset') reset();
    },
    [reset],
  );

  // Session ended while minimised (room not on screen): tell the user, then clear.
  useEffect(() => {
    if (!blocked || roomFocused || !idRef.current) return;
    void showToast(BLOCKED_TEXT[blocked], 'info');
    reset();
  }, [blocked, roomFocused, reset]);

  // Logout: drop audio locally (the server presence expires on its own).
  useEffect(() => {
    if (!isAuthenticated && idRef.current) reset();
  }, [isAuthenticated, reset]);

  // A live stream needs the single native audio engine: it releases the council.
  useEffect(() => {
    registerCouncilReleaser(() => {
      if (!idRef.current || !joinedRef.current) return false;
      void leave();
      return true;
    });
    return () => registerCouncilReleaser(null);
  }, [leave]);

  // Safety-net resync while connected.
  useEffect(() => {
    if (!joined) return undefined;
    const t = setInterval(() => void refresh(), COUNCIL_RESYNC_MS);
    return () => clearInterval(t);
  }, [joined, refresh]);

  // v1 background policy: auto-mute when the app leaves the foreground, resync on return.
  // Listening keeps going while the OS allows it.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (next) => {
      const id = idRef.current;
      const s = stateRef.current;
      if (!id || !joinedRef.current || !s) return;
      // Only real backgrounding — iOS goes `inactive` for permission prompts/control center.
      if (next === 'background') {
        wasBackground = true;
        // With the background module (Android microphone service / iOS audio mode) the
        // mic keeps working; without it (older builds) fall back to the v1 auto-mute.
        const micCaptureAllowed = micCaptureAllowedInBackground(bgNative);
        if (shouldAutoMuteOnBackground({ onStage: s.me.onStage, micMuted: s.me.micMuted, micCaptureAllowed })) {
          audioRef.current.setMuted(true);
          setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: true } } : prev));
          void setCouncilMic(id, true).catch(() => undefined);
        }
      } else if (next === 'active' && wasBackground) {
        wasBackground = false;
        // Re-apply the service so Android can upgrade to the microphone type now that
        // we're in the foreground again (refused from the background on Android 14+).
        bgKeyRef.current = applyBackgroundAudio(bgNative, bgPlanRef.current, bgKeyRef.current, true);
        void refresh();
        void audioRef.current.renew();
      }
    });
    return () => sub.remove();
  }, [refresh, bgNative]);

  // Background audio service: runs while the council audio is live; type follows the stage.
  const bgPlan = useMemo(
    () =>
      planBackgroundAudio({
        councilId,
        joined,
        blocked,
        audioStatus: audio.status,
        title: state?.council.name,
        onStage: Boolean(state?.me.onStage),
        micMuted: state?.me.micMuted ?? true,
      }),
    [councilId, joined, blocked, audio.status, state?.council.name, state?.me.onStage, state?.me.micMuted],
  );
  useEffect(() => {
    const prev = bgKeyRef.current;
    bgPlanRef.current = bgPlan;
    bgKeyRef.current = applyBackgroundAudio(bgNative, bgPlan, prev);
    if (bgNative && bgPlan.kind === 'run' && (prev === '' || prev === 'stop')) {
      void ensureCouncilNotificationPermission();
    }
  }, [bgNative, bgPlan]);

  // Provider unmount (app teardown): don't leave the notification behind.
  useEffect(
    () => () => {
      if (bgKeyRef.current !== 'stop') applyBackgroundAudio(bgNative, { kind: 'stop' }, bgKeyRef.current);
    },
    [bgNative],
  );

  // Notification «مغادرة» / app swiped away → the same flow as the in-app «مغادرة».
  // iOS call/Siri interruption ended → resume the engine's audio.
  useEffect(
    () =>
      subscribeCouncilAudio(bgNative, {
        onLeave: (e) => {
          if (shouldLeaveFromNative(e, idRef.current)) void leave();
        },
        onInterruption: (e) => {
          if (e?.phase === 'ended' && idRef.current && joinedRef.current) audioRef.current.recover();
        },
      }),
    [bgNative, leave],
  );

  useCouncilSocket({
    councilId: councilId ?? undefined,
    accessToken,
    enabled: Boolean(councilId) && joined && !blocked,
    handlers: {
      onResync: () => void refresh(),
      onSpeakers: (p) =>
        setState((prev) =>
          prev
            ? {
                ...prev,
                speakers: p.speakers,
                speakersCount: p.speakersCount,
                listenerCount: p.listenerCount,
                isFull: p.speakersCount >= prev.council.maxSpeakers,
              }
            : prev,
        ),
      onListeners: (p) => setState((prev) => (prev ? { ...prev, listenerCount: p.listenerCount } : prev)),
      onMic: (p) =>
        setState((prev) => {
          if (!prev) return prev;
          const speakers = prev.speakers.map((s) =>
            s.userId === p.userId
              ? { ...s, micMuted: p.micMuted, mutedByModerator: p.mutedByModerator ?? s.mutedByModerator }
              : s,
          );
          const mine = p.userId === prev.me.userId;
          if (mine) audioRef.current.setMuted(p.micMuted);
          return {
            ...prev,
            speakers,
            me: mine
              ? { ...prev.me, micMuted: p.micMuted, mutedByModerator: p.mutedByModerator ?? prev.me.mutedByModerator }
              : prev.me,
          };
        }),
      onRole: (p) => {
        const before = stateRef.current?.me;
        if (before && before.seatIndex === null && p.seatIndex !== null) {
          void showToast('أصبحت متحدثاً — الميكروفون مغلق حتى تفتحه', 'success');
        } else if (before && before.seatIndex !== null && p.seatIndex === null) {
          void showToast('عدت إلى المستمعين', 'info');
        } else if (p.mutedByModerator && !before?.mutedByModerator) {
          void showToast('تم كتم الميكروفون من المشرف', 'info');
        }
        if (p.micMuted) audioRef.current.setMuted(true);
        void refresh();
        void audioRef.current.renew();
      },
      onKicked: (p) => setBlocked(p.reason === 'banned' ? 'banned' : 'kicked'),
      onRequestResult: (p) => {
        if (p.status === 'REJECTED') void showToast('لم يتم قبول طلبك هذه المرة', 'info');
        void refresh();
      },
      onRequests: (p) => setState((prev) => (prev ? { ...prev, pendingRequests: p.pending } : prev)),
      onEnded: () => setBlocked('ended'),
      onUpdated: () => void refresh(),
      onError: (p) => {
        if (p.code === 'council_ended') setBlocked('ended');
        else if (p.code === 'council_banned') setBlocked('banned');
        else if (p.code === 'council_kicked') setBlocked('kicked');
        else void refresh();
      },
    },
  });

  const stageSpeakers = useMemo(() => (state ? withMyMicState(state.speakers, state.me) : []), [state]);
  const speakingUserIds = useMemo(
    () => (state ? speakingUserIdsFor(audio.speakingUids, stageSpeakers, state.me) : new Set<string>()),
    [audio.speakingUids, stageSpeakers, state],
  );
  const miniPlayerVisible = isMiniPlayerVisible({ councilId, joined, blocked, roomFocused, hasState: Boolean(state) });

  const value = useMemo<CouncilSessionValue>(
    () => ({
      councilId,
      state,
      loading,
      loadError,
      blocked,
      joined,
      joining,
      busy,
      agoraError,
      audio,
      stageSpeakers,
      speakingUserIds,
      miniPlayerVisible,
      open,
      join,
      refresh,
      setState,
      setBlocked,
      setBusy,
      run,
      toggleMic,
      leave,
      setRoomFocused,
    }),
    [
      councilId,
      state,
      loading,
      loadError,
      blocked,
      joined,
      joining,
      busy,
      agoraError,
      audio,
      stageSpeakers,
      speakingUserIds,
      miniPlayerVisible,
      open,
      join,
      refresh,
      setBlocked,
      run,
      toggleMic,
      leave,
      setRoomFocused,
    ],
  );

  return <CouncilSessionContext.Provider value={value}>{children}</CouncilSessionContext.Provider>;
}

export function useCouncilSession(): CouncilSessionValue {
  const ctx = useContext(CouncilSessionContext);
  if (!ctx) throw new Error('useCouncilSession must be used inside CouncilSessionProvider');
  return ctx;
}

/** Optional access (tab bar, FABs) — null outside the provider. */
export function useOptionalCouncilSession(): CouncilSessionValue | null {
  return useContext(CouncilSessionContext);
}

/**
 * Live-stream screens: free the shared audio engine on mount. If a council was active
 * it is left (with a short notice) before the stream starts.
 */
export function useYieldCouncilForLive(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (releaseCouncilForLive()) void showToast('غادرت المجلس لتشغيل البث المباشر', 'info');
  }, [enabled]);
}
