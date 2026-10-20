// «المجالس» audio engine (Agora, audio-only). Loaded through the councils flag only
// (lib/councilsAgora.ts) — live streaming code (useLiveStream) is untouched.
//
// Token model (server side): listeners get join/subscribe only; speakers additionally
// get publish-audio with a ~10 min privilege. Renewal goes through `requestToken`,
// which calls POST /councils/:id/token — the server re-reads my role from the DB, so a
// demoted/muted/banned speaker cannot keep publishing by renewing.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DisconnectReason,
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  VideoPreset,
  type RemoteTrackPublication,
  type VideoTrack,
} from 'livekit-client';
import { getCouncilAgoraModule } from '@/lib/councilsAgora';
import {
  COUNCIL_SPEAKING_HOLD_MS,
  COUNCIL_VOLUME_INTERVAL_MS,
  speakingFrom,
  updateSpeaking,
  type LastLoudMap,
} from '@/lib/councilSpeaking';
import { ensureCameraPermission, ensureMicPermission } from '@/lib/livePermissions';
import {
  claimRtcEngine,
  isEngineBusyElsewhere,
  releaseRtcEngine,
} from '@/lib/rtcEngineGuard';
import {
  councilCameraOptions,
  type CouncilMediaCredentials,
  type CouncilTokenResult,
  type CouncilVideoProfile,
} from '@/services/councils';

/** A camera track on the council stage (golden councils only). */
export type CouncilVideoTrack = { identity: string; isLocal: boolean; track: VideoTrack };

function collectVideoTracks(room: Room): CouncilVideoTrack[] {
  const out: CouncilVideoTrack[] = [];
  const local = room.localParticipant.getTrackPublication(Track.Source.Camera);
  if (local?.track && !local.isMuted) {
    out.push({ identity: room.localParticipant.identity, isLocal: true, track: local.track as VideoTrack });
  }
  room.remoteParticipants.forEach((p) => {
    const pub = p.getTrackPublication(Track.Source.Camera);
    if (pub?.track && pub.isSubscribed && !pub.isMuted) {
      out.push({ identity: p.identity, isLocal: false, track: pub.track as VideoTrack });
    }
  });
  return out;
}

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
  const [speakingIdentities, setSpeakingIdentities] = useState<string[]>([]);
  const [videoTracks, setVideoTracks] = useState<CouncilVideoTrack[]>([]);
  const [cameraOn, setCameraOn] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const roomRef = useRef<Room | null>(null);
  const handlerRef = useRef<Handler | null>(null);
  const publisherRef = useRef(false);
  const mutedRef = useRef(true);
  const canCameraRef = useRef(false);
  const videoProfileRef = useRef<CouncilVideoProfile | null>(null);
  const watchVideoRef = useRef(false);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewing = useRef<Promise<void> | null>(null);
  const restarting = useRef(false);
  const speakingKey = useRef('');
  const lastLoud = useRef<LastLoudMap>({});
  const decayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef({ requestToken, onFatal, onMicDenied });
  optsRef.current = { requestToken, onFatal, onMicDenied };

  const publishSpeaking = (uids: number[]) => {
    const key = uids.join(',');
    if (key === speakingKey.current) return;
    speakingKey.current = key;
    setSpeakingUids(uids);
  };

  const clearDecay = () => {
    if (decayTimer.current) clearTimeout(decayTimer.current);
    decayTimer.current = null;
  };

  /** Drops speakers whose hold ran out even if Agora stops sending callbacks. */
  const scheduleDecay = () => {
    clearDecay();
    if (Object.keys(lastLoud.current).length === 0) return;
    decayTimer.current = setTimeout(() => {
      decayTimer.current = null;
      const now = Date.now();
      const next = updateSpeaking(lastLoud.current, [], now, mutedRef.current);
      lastLoud.current = next.lastLoud;
      publishSpeaking(next.speaking);
      scheduleDecay();
    }, COUNCIL_SPEAKING_HOLD_MS + 50);
  };

  const clearRenew = () => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = null;
  };

  /** Applies a (possibly changed) role to the running engine. */
  const applyCredentials = useCallback(
    async (creds: Pick<CouncilMediaCredentials, 'token' | 'role' | 'expiresIn' | 'publishExpiresIn' | 'url' | 'provider' | 'canCamera' | 'videoProfile'>, micMuted: boolean) => {
      const room = roomRef.current;
      if (room) {
        canCameraRef.current = Boolean(creds.canCamera) && creds.role === 'publisher';
        videoProfileRef.current = creds.videoProfile ?? null;
        if (!canCameraRef.current && room.localParticipant.isCameraEnabled) {
          await room.localParticipant.setCameraEnabled(false);
        }
        let publisher = creds.role === 'publisher';
        if (publisher && !publisherRef.current && !(await ensureMicPermission())) {
          optsRef.current.onMicDenied?.();
          publisher = false;
        }
        publisherRef.current = publisher;
        mutedRef.current = !publisher || micMuted;
        await room.localParticipant.setMicrophoneEnabled(publisher && !mutedRef.current);
        if (creds.token && creds.url && room.state === ConnectionState.Disconnected) {
          await room.connect(creds.url, creds.token);
        }
        scheduleRenew(creds);
        return;
      }
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

  function scheduleRenew(creds: Pick<CouncilMediaCredentials, 'expiresIn' | 'publishExpiresIn'>) {
    clearRenew();
    const ttl = Math.min(creds.expiresIn, creds.publishExpiresIn ?? creds.expiresIn);
    const delay = Math.max(15, ttl - RENEW_MARGIN_S) * 1000;
    renewTimer.current = setTimeout(() => void renew(), delay);
  }

  const teardown = useCallback(() => {
    clearRenew();
    clearDecay();
    const room = roomRef.current;
    roomRef.current = null;
    canCameraRef.current = false;
    videoProfileRef.current = null;
    setVideoTracks([]);
    setCameraOn(false);
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
    }
    const engine = engineRef.current;
    engineRef.current = null;
    publisherRef.current = false;
    speakingKey.current = '';
    lastLoud.current = {};
    setSpeakingUids([]);
    setSpeakingIdentities([]);
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
    async (creds: CouncilMediaCredentials, micMuted: boolean): Promise<CouncilAudioStatus> => {
      const livekit = creds.provider === 'livekit' || Boolean(creds.url);
      if (livekit) {
        if (!creds.url || !creds.token || !councilId) {
          setStatus('unavailable');
          return 'unavailable';
        }
        if (roomRef.current) {
          await applyCredentials(creds, micMuted);
          return 'connected';
        }
        let publisher = creds.role === 'publisher';
        if (publisher && !(await ensureMicPermission())) {
          optsRef.current.onMicDenied?.();
          publisher = false;
        }
        if (!claimRtcEngine('council', councilId)) {
          setStatus('busy');
          return 'busy';
        }
        setStatus('connecting');
        canCameraRef.current = Boolean(creds.canCamera) && creds.role === 'publisher';
        videoProfileRef.current = creds.videoProfile ?? null;
        // adaptiveStream + dynacast: video that is not rendered / has no viewer costs no
        // bandwidth; audio-only councils are unaffected.
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        roomRef.current = room;
        room.on(RoomEvent.Connected, () => setStatus('connected'));
        room.on(RoomEvent.Reconnecting, () => setStatus('reconnecting'));
        room.on(RoomEvent.Reconnected, () => setStatus('connected'));
        room.on(RoomEvent.Disconnected, (reason) => {
          if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
            optsRef.current.onFatal?.('banned');
            return;
          }
          if (reason === DisconnectReason.CLIENT_INITIATED) return;
          setStatus('failed');
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeakingIdentities(speakers.map((s) => s.identity));
        });
        room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
          if (!participant.isLocal) return;
          if (!participant.permissions?.canPublish) {
            publisherRef.current = false;
            mutedRef.current = true;
            canCameraRef.current = false;
            void room.localParticipant.setMicrophoneEnabled(false);
            void room.localParticipant.setCameraEnabled(false);
          }
        });
        const syncVideo = () => {
          setVideoTracks(collectVideoTracks(room));
          setCameraOn(room.localParticipant.isCameraEnabled);
        };
        // Listeners subscribe to a camera only while the stage is being watched.
        const applyWatch = (pub: RemoteTrackPublication) => {
          if (pub.kind === Track.Kind.Video && pub.isSubscribed !== watchVideoRef.current) {
            pub.setSubscribed(watchVideoRef.current);
          }
        };
        room.on(RoomEvent.TrackPublished, (pub) => applyWatch(pub));
        room.on(RoomEvent.TrackSubscribed, syncVideo);
        room.on(RoomEvent.TrackUnsubscribed, syncVideo);
        room.on(RoomEvent.TrackMuted, syncVideo);
        room.on(RoomEvent.TrackUnmuted, syncVideo);
        room.on(RoomEvent.LocalTrackPublished, syncVideo);
        room.on(RoomEvent.LocalTrackUnpublished, syncVideo);
        room.on(RoomEvent.ParticipantDisconnected, syncVideo);
        try {
          await room.connect(creds.url, creds.token);
          room.remoteParticipants.forEach((p) =>
            p.trackPublications.forEach((pub) => applyWatch(pub as RemoteTrackPublication)),
          );
          await room.startAudio().catch(() => undefined);
          publisherRef.current = publisher;
          mutedRef.current = !publisher || micMuted;
          if (publisher) {
            await room.localParticipant.setMicrophoneEnabled(!mutedRef.current);
          }
          scheduleRenew(creds);
          return 'connecting';
        } catch {
          teardown();
          setStatus('failed');
          return 'failed';
        }
      }
      const agora = getCouncilAgoraModule();
      if (!agora || !councilId) {
        setStatus('unavailable');
        return 'unavailable';
      }
      if (engineRef.current) {
        await applyCredentials(creds, micMuted);
        return 'connected';
      }
      // Ask for the mic BEFORE the engine exists: on Android the permission dialog
      // pauses the activity (AppState background → active), and the room screen's
      // resume handler calls renew() → applyCredentials(). With no engine yet that
      // is a no-op instead of a second permission prompt + role switch racing the join.
      let publisher = creds.role === 'publisher';
      if (publisher && !(await ensureMicPermission())) {
        optsRef.current.onMicDenied?.();
        publisher = false;
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
            // Local (uid 0) and remote reports arrive in separate callbacks; merge them.
            const next = updateSpeaking(lastLoud.current, speakers, Date.now(), mutedRef.current);
            lastLoud.current = next.lastLoud;
            publishSpeaking(next.speaking);
            scheduleDecay();
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
        engine.enableAudioVolumeIndication(COUNCIL_VOLUME_INTERVAL_MS, 3, true);

        const role = publisher
          ? agora.ClientRoleType.ClientRoleBroadcaster
          : agora.ClientRoleType.ClientRoleAudience;
        engine.setClientRole(role);
        publisherRef.current = publisher;
        mutedRef.current = !publisher || micMuted;
        const code = engine.joinChannel(creds.token, creds.channel ?? '', creds.uid ?? 0, {
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
    if (publisherRef.current) {
      engineRef.current?.muteLocalAudioStream(muted);
      void roomRef.current?.localParticipant.setMicrophoneEnabled(!muted);
    }
    if (muted && lastLoud.current[0] !== undefined) {
      // Stop my own indicator right away instead of waiting for the hold to run out.
      const rest: Record<number, number> = { ...lastLoud.current };
      delete rest[0];
      lastLoud.current = rest;
      publishSpeaking(speakingFrom(rest, Date.now()));
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
  }, [teardown]);

  /** Golden council: start / stop my camera (only with a server `av` grant). */
  const setCamera = useCallback(async (on: boolean): Promise<boolean> => {
    const room = roomRef.current;
    if (!room) return false;
    if (!on) {
      await room.localParticipant.setCameraEnabled(false);
      setCameraOn(false);
      return true;
    }
    const profile = videoProfileRef.current;
    if (!canCameraRef.current || !profile) return false;
    if (!(await ensureCameraPermission())) return false;
    const opts = councilCameraOptions(profile);
    try {
      await room.localParticipant.setCameraEnabled(true, opts.resolution, {
        simulcast: opts.publish.simulcast,
        videoEncoding: opts.publish.videoEncoding,
        videoSimulcastLayers: opts.publish.videoSimulcastLayers.map(
          (l) => new VideoPreset(l.width, l.height, l.encoding.maxBitrate, l.encoding.maxFramerate),
        ),
      });
      setCameraOn(room.localParticipant.isCameraEnabled);
      return room.localParticipant.isCameraEnabled;
    } catch {
      setCameraOn(false);
      return false;
    }
  }, []);

  /** Subscribe to stage cameras only while the room is on screen. */
  const setWatchVideo = useCallback((watch: boolean) => {
    watchVideoRef.current = watch;
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((p) =>
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Video) (pub as RemoteTrackPublication).setSubscribed(watch);
      }),
    );
  }, []);

  /**
   * After an audio interruption (iOS call/Siri/alarm) the session is re-activated
   * natively; restart the engine's audio module (enableAudio replaces the deprecated
   * resumeAudio), re-apply my mic state and refresh the token/role.
   */
  const recover = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(
        publisherRef.current && !mutedRef.current,
      );
      void renew();
    }
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.enableAudio();
      if (publisherRef.current) engine.muteLocalAudioStream(mutedRef.current);
    } catch {
      // engine gone — the connection-state handler rejoins if needed
    }
    void renew();
  }, [renew]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    status,
    speakingUids,
    speakingIdentities,
    videoTracks,
    cameraOn,
    setCamera,
    setWatchVideo,
    start,
    stop,
    setMuted,
    applyCredentials,
    renew,
    recover,
    isPublisher: () => publisherRef.current,
  };
}
