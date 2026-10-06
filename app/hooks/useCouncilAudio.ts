// «المجالس» audio engine (Agora, audio-only). Loaded through the councils flag only
// (lib/councilsAgora.ts) — live streaming code (useLiveStream) is untouched.
//
// Token model (server side): listeners get join/subscribe only; speakers additionally
// get publish-audio with a ~10 min privilege. Renewal goes through `requestToken`,
// which calls POST /councils/:id/token — the server re-reads my role from the DB, so a
// demoted/muted/banned speaker cannot keep publishing by renewing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCouncilAgoraModule } from '@/lib/councilsAgora';
import { ensureMicPermission } from '@/lib/livePermissions';
import {
  claimRtcEngine,
  isEngineBusyElsewhere,
  releaseRtcEngine,
} from '@/lib/rtcEngineGuard';
import type { CouncilAgoraCredentials, CouncilTokenResult } from '@/services/councils';

export type CouncilAudioStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'unavailable'
  | 'busy';

type Engine = ReturnType<NonNullable<ReturnType<typeof getCouncilAgoraModule>>['createAgoraRtcEngine']>;
type Handler = Parameters<Engine['registerEventHandler']>[0];

type Options = {
  councilId: string | undefined;
  /** Fresh token from the server (role re-read from DB). Null = unavailable. */
  requestToken: () => Promise<CouncilTokenResult | null>;
  /** Server/SDK says we must leave (banned by Agora kicking-rule, etc.). */
  onFatal?: (reason: 'banned' | 'failed') => void;
  /** Mic permission denied while on stage. */
  onMicDenied?: () => void;
};

const SPEAKING_VOLUME = 30;
const RENEW_MARGIN_S = 60;
const AGORA_CONNECTED = 3;
const AGORA_RECONNECTING = 4;
const AGORA_FAILED = 5;
const REASON_BANNED = 3;
const REASON_INVALID_TOKEN = 8;
const REASON_TOKEN_EXPIRED = 9;

export function useCouncilAudio({ councilId, requestToken, onFatal, onMicDenied }: Options) {
  const [status, setStatus] = useState<CouncilAudioStatus>('idle');
  const [speakingUids, setSpeakingUids] = useState<number[]>([]);

  const engineRef = useRef<Engine | null>(null);
  const handlerRef = useRef<Handler | null>(null);
  const publisherRef = useRef(false);
  const mutedRef = useRef(true);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewing = useRef<Promise<void> | null>(null);
  const restarting = useRef(false);
  const speakingKey = useRef('');
  const optsRef = useRef({ requestToken, onFatal, onMicDenied });
  optsRef.current = { requestToken, onFatal, onMicDenied };

  const clearRenew = () => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = null;
  };

  /** Applies a (possibly changed) role to the running engine. */
  const applyCredentials = useCallback(
    async (creds: Pick<CouncilAgoraCredentials, 'token' | 'role' | 'expiresIn' | 'publishExpiresIn'>, micMuted: boolean) => {
      const agora = getCouncilAgoraModule();
      const engine = engineRef.current;
      if (!agora || !engine) return;
      let publisher = creds.role === 'publisher';
      if (publisher && !publisherRef.current && !(await ensureMicPermission())) {
        optsRef.current.onMicDenied?.();
        publisher = false;
      }
      const wasPublisher = publisherRef.current;
      // Promotion: renew first (token now carries publish) → then switch role.
      // Demotion: stop publishing first → then renew with the subscriber token.
      if (!wasPublisher || publisher) engine.renewToken(creds.token);
      if (publisher !== wasPublisher) {
        const role = publisher
          ? agora.ClientRoleType.ClientRoleBroadcaster
          : agora.ClientRoleType.ClientRoleAudience;
        engine.setClientRole(role);
        engine.updateChannelMediaOptions({
          clientRoleType: role,
          publishMicrophoneTrack: publisher,
          publishCameraTrack: false,
        });
        publisherRef.current = publisher;
      }
      if (wasPublisher && !publisher) engine.renewToken(creds.token);
      mutedRef.current = !publisher || micMuted;
      if (publisher) engine.muteLocalAudioStream(mutedRef.current);
      scheduleRenew(creds);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const renew = useCallback(async () => {
    if (renewing.current) return renewing.current;
    renewing.current = (async () => {
      try {
        const next = await optsRef.current.requestToken();
        if (next && engineRef.current) await applyCredentials(next, next.micMuted);
      } catch {
        // retried by the next privilege-will-expire callback / timer
        renewTimer.current = setTimeout(() => void renew(), 15_000);
      } finally {
        renewing.current = null;
      }
    })();
    return renewing.current;
  }, [applyCredentials]);

  function scheduleRenew(creds: Pick<CouncilAgoraCredentials, 'expiresIn' | 'publishExpiresIn'>) {
    clearRenew();
    const ttl = Math.min(creds.expiresIn, creds.publishExpiresIn ?? creds.expiresIn);
    const delay = Math.max(15, ttl - RENEW_MARGIN_S) * 1000;
    renewTimer.current = setTimeout(() => void renew(), delay);
  }

  const teardown = useCallback(() => {
    clearRenew();
    const engine = engineRef.current;
    engineRef.current = null;
    publisherRef.current = false;
    speakingKey.current = '';
    setSpeakingUids([]);
    if (engine) {
      try {
        engine.leaveChannel();
        if (handlerRef.current) engine.unregisterEventHandler(handlerRef.current);
        engine.release();
      } catch {
        // engine already gone
      }
    }
    handlerRef.current = null;
    if (councilId) releaseRtcEngine('council', councilId);
  }, [councilId]);

  const start = useCallback(
    async (creds: CouncilAgoraCredentials, micMuted: boolean): Promise<CouncilAudioStatus> => {
      const agora = getCouncilAgoraModule();
      if (!agora || !councilId) {
        setStatus('unavailable');
        return 'unavailable';
      }
      if (engineRef.current) {
        await applyCredentials(creds, micMuted);
        return 'connected';
      }
      const engine = agora.createAgoraRtcEngine();
      let state: number | null = null;
      try {
        state = engine.getConnectionState();
      } catch {
        state = null;
      }
      if (isEngineBusyElsewhere(state) || !claimRtcEngine('council', councilId)) {
        setStatus('busy');
        return 'busy';
      }
      setStatus('connecting');
      try {
        engine.initialize({
          appId: creds.appId,
          channelProfile: agora.ChannelProfileType.ChannelProfileLiveBroadcasting,
          audioScenario: agora.AudioScenarioType.AudioScenarioChatroom,
          logConfig: { level: 0x0001 },
        });
        engineRef.current = engine;
        const handler: Handler = {
          onJoinChannelSuccess() {
            setStatus('connected');
          },
          onConnectionStateChanged(_c, state, reason) {
            if (state === AGORA_CONNECTED) setStatus('connected');
            else if (state === AGORA_RECONNECTING) setStatus('reconnecting');
            else if (state === AGORA_FAILED) {
              if (reason === REASON_BANNED) {
                optsRef.current.onFatal?.('banned');
                return;
              }
              if (reason === REASON_TOKEN_EXPIRED || reason === REASON_INVALID_TOKEN) {
                void restart();
                return;
              }
              setStatus('failed');
              optsRef.current.onFatal?.('failed');
            }
          },
          onTokenPrivilegeWillExpire() {
            void renew();
          },
          onRequestToken() {
            void renew();
          },
          onAudioVolumeIndication(_c, speakers) {
            const uids = (speakers ?? [])
              .filter((s) => (s.volume ?? 0) >= SPEAKING_VOLUME && (s.uid !== 0 || !mutedRef.current))
              .map((s) => s.uid ?? 0)
              .sort((a, b) => a - b);
            const key = uids.join(',');
            if (key !== speakingKey.current) {
              speakingKey.current = key;
              setSpeakingUids(uids);
            }
          },
        };
        handlerRef.current = handler;
        engine.registerEventHandler(handler);
        engine.disableVideo();
        engine.enableAudio();
        engine.setAudioProfile(
          agora.AudioProfileType.AudioProfileDefault,
          agora.AudioScenarioType.AudioScenarioChatroom,
        );
        engine.setDefaultAudioRouteToSpeakerphone(true);
        engine.enableAudioVolumeIndication(400, 3, true);

        let publisher = creds.role === 'publisher';
        if (publisher && !(await ensureMicPermission())) {
          optsRef.current.onMicDenied?.();
          publisher = false;
        }
        const role = publisher
          ? agora.ClientRoleType.ClientRoleBroadcaster
          : agora.ClientRoleType.ClientRoleAudience;
        engine.setClientRole(role);
        publisherRef.current = publisher;
        mutedRef.current = !publisher || micMuted;
        const code = engine.joinChannel(creds.token, creds.channel, creds.uid, {
          clientRoleType: role,
          channelProfile: agora.ChannelProfileType.ChannelProfileLiveBroadcasting,
          publishMicrophoneTrack: publisher,
          publishCameraTrack: false,
          autoSubscribeAudio: true,
          autoSubscribeVideo: false,
        });
        if (code !== 0) throw new Error(`join ${code}`);
        if (publisher) engine.muteLocalAudioStream(mutedRef.current);
        scheduleRenew(creds);
        return 'connecting';
      } catch {
        teardown();
        setStatus('failed');
        return 'failed';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [councilId, applyCredentials, renew, teardown],
  );

  /** Full rejoin with a fresh token (expired/invalid token or failed connection). */
  async function restart() {
    if (restarting.current) return;
    restarting.current = true;
    try {
      const next = await optsRef.current.requestToken();
      teardown();
      if (next) await start(next, next.micMuted);
      else setStatus('unavailable');
    } catch {
      teardown();
      setStatus('failed');
    } finally {
      restarting.current = false;
    }
  }

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (publisherRef.current) engineRef.current?.muteLocalAudioStream(muted);
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    status,
    speakingUids,
    start,
    stop,
    setMuted,
    applyCredentials,
    renew,
    isPublisher: () => publisherRef.current,
  };
}
