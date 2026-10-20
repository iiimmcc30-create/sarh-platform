// hooks/useLiveStream.ts
// RTC hook — LiveKit by default, Agora when the server (or build) says so.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteVideoTrack,
} from 'livekit-client';
import { getAgoraModule } from '@/lib/agora';
import { ensureLivePermissions } from '@/lib/livePermissions';
import { claimRtcEngine, markLiveSession, releaseRtcEngine } from '@/lib/rtcEngineGuard';
import { providerFromCreds } from '@/lib/rtcProvider';

export type StreamRole = 'host' | 'viewer';

export interface AgoraCredentials {
  provider?: 'livekit' | 'agora';
  agoraAppId?: string | null;
  agoraChannel?: string | null;
  agoraToken?: string | null;
  agoraUid?: number | null;
  livekitUrl?: string | null;
  livekitToken?: string | null;
  livekitRoom?: string | null;
  expiresIn?: number;
}

export interface RemoteUser {
  uid: number;
  identity?: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface LiveStreamState {
  isJoined: boolean;
  isPublishing: boolean;
  localUid: number | null;
  remoteUsers: RemoteUser[];
  error: string | null;
  stats: Record<string, number | undefined>;
  localVideoTrack: LocalVideoTrack | null;
  remoteVideoTrack: RemoteVideoTrack | null;
}

interface UseLiveStreamOptions {
  role: StreamRole;
  onTokenWillExpire?: () => Promise<string>;
  onError?: (err: string) => void;
}

const EXPO_GO_MESSAGE =
  'البث المباشر يتطلب development build ولا يعمل داخل Expo Go.';
const SESSION_ID = 'live';

function wantsLiveKit(creds?: AgoraCredentials): boolean {
  return providerFromCreds(creds) === 'livekit';
}

export function useLiveStream({ role, onTokenWillExpire, onError }: UseLiveStreamOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineRef = useRef<any>(null);
  const roomRef = useRef<Room | null>(null);
  const previewRef = useRef<Array<LocalVideoTrack | LocalAudioTrack>>([]);
  const facingRef = useRef<'user' | 'environment'>('user');
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJoin = useRef<{ resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  const [state, setState] = useState<LiveStreamState>({
    isJoined: false,
    isPublishing: false,
    localUid: null,
    remoteUsers: [],
    error: null,
    stats: {},
    localVideoTrack: null,
    remoteVideoTrack: null,
  });

  const reportUnavailable = useCallback(() => {
    setState((s) => ({ ...s, error: EXPO_GO_MESSAGE }));
    onError?.(EXPO_GO_MESSAGE);
  }, [onError]);

  const handleTokenRenewal = useCallback(async () => {
    if (!onTokenWillExpire) return;
    try {
      const newToken = await onTokenWillExpire();
      engineRef.current?.renewToken(newToken);
    } catch {
      setState((s) => ({ ...s, error: 'فشل تجديد التوكن' }));
    }
  }, [onTokenWillExpire]);

  const init = useCallback(async (appId: string) => {
    const agora = getAgoraModule();
    if (!agora) {
      reportUnavailable();
      return;
    }

    if (engineRef.current) return;

    const engine = agora.createAgoraRtcEngine();
    engineRef.current = engine;
    engine.initialize({ appId, logConfig: { level: 0x0001 } });

    engine.registerEventHandler({
      onJoinChannelSuccess(connection, _elapsed) {
        if (pendingJoin.current) {
          clearTimeout(pendingJoin.current.timer);
          pendingJoin.current.resolve();
          pendingJoin.current = null;
        }
        setState((s) => ({
          ...s,
          isJoined: true,
          localUid: connection.localUid ?? 0,
          error: null,
        }));
      },
      onLeaveChannel(_connection, stats) {
        setState((s) => ({
          ...s,
          isJoined: false,
          isPublishing: false,
          localUid: null,
          remoteUsers: [],
          stats: stats as Record<string, number | undefined>,
        }));
      },
      onUserJoined(_connection, remoteUid) {
        setState((s) => ({
          ...s,
          remoteUsers: [...s.remoteUsers, { uid: remoteUid, hasVideo: true, hasAudio: true }],
        }));
      },
      onUserOffline(_connection, remoteUid) {
        setState((s) => ({
          ...s,
          remoteUsers: s.remoteUsers.filter((u) => u.uid !== remoteUid),
        }));
      },
      onRemoteVideoStateChanged(_connection, remoteUid, videoState) {
        setState((s) => ({
          ...s,
          remoteUsers: s.remoteUsers.map((u) =>
            u.uid === remoteUid ? { ...u, hasVideo: videoState !== 0 } : u,
          ),
        }));
      },
      onRemoteAudioStateChanged(_connection, remoteUid, audioState) {
        setState((s) => ({
          ...s,
          remoteUsers: s.remoteUsers.map((u) =>
            u.uid === remoteUid ? { ...u, hasAudio: audioState !== 0 } : u,
          ),
        }));
      },
      onRtcStats(_connection, stats) {
        setState((s) => ({ ...s, stats: stats as Record<string, number | undefined> }));
      },
      onTokenPrivilegeWillExpire() {
        handleTokenRenewal();
      },
      onError(err, msg) {
        const message = `Agora error ${err}: ${msg}`;
        if (pendingJoin.current) {
          clearTimeout(pendingJoin.current.timer);
          pendingJoin.current.reject(new Error(message));
          pendingJoin.current = null;
        }
        setState((s) => ({ ...s, error: message }));
        onError?.(message);
      },
    });
  }, [handleTokenRenewal, onError, reportUnavailable]);

  const stopPreviewTracks = useCallback(async () => {
    const tracks = previewRef.current;
    previewRef.current = [];
    tracks.forEach((t) => t.stop());
    setState((s) => ({ ...s, localVideoTrack: null }));
  }, []);

  const bindRoom = useCallback((room: Room) => {
    const pickRemote = () => {
      let video: RemoteVideoTrack | null = null;
      const remotes: RemoteUser[] = [];
      for (const participant of room.remoteParticipants.values()) {
        const pub = participant.getTrackPublication(Track.Source.Camera);
        if (pub?.track && pub.track.kind === Track.Kind.Video) {
          video = pub.track as RemoteVideoTrack;
        }
        remotes.push({
          uid: 0,
          identity: participant.identity,
          hasVideo: Boolean(pub?.track),
          hasAudio: participant.isMicrophoneEnabled,
        });
      }
      setState((s) => ({ ...s, remoteUsers: remotes, remoteVideoTrack: video }));
    };
    room.on(RoomEvent.Connected, () => {
      markLiveSession(true);
      setState((s) => ({ ...s, isJoined: true, localUid: 0, error: null }));
    });
    room.on(RoomEvent.Reconnecting, () => {
      setState((s) => ({ ...s, error: null }));
    });
    room.on(RoomEvent.Disconnected, (reason) => {
      const removed = reason === DisconnectReason.PARTICIPANT_REMOVED;
      setState((s) => ({
        ...s,
        isJoined: false,
        isPublishing: false,
        remoteUsers: [],
        remoteVideoTrack: null,
        error: removed ? 'تمت إزالتك من البث' : s.error,
      }));
    });
    room.on(RoomEvent.TrackSubscribed, pickRemote);
    room.on(RoomEvent.TrackUnsubscribed, pickRemote);
    room.on(RoomEvent.ParticipantConnected, pickRemote);
    room.on(RoomEvent.ParticipantDisconnected, pickRemote);
  }, []);

  const joinLiveKit = useCallback(async (creds: AgoraCredentials) => {
    const url = creds.livekitUrl ?? '';
    const token = creds.livekitToken ?? '';
    if (!url || !token) throw new Error('بيانات البث غير مكتملة');
    if (!claimRtcEngine('live', SESSION_ID)) {
      throw new Error('هناك جلسة صوتية أخرى تعمل الآن');
    }
    if (role === 'host') {
      const permitted = await ensureLivePermissions();
      if (!permitted) throw new Error('يجب السماح بالكاميرا والميكروفون لبدء البث');
    }
    const room = roomRef.current ?? new Room({ adaptiveStream: true, dynacast: true });
    if (!roomRef.current) bindRoom(room);
    roomRef.current = room;
    await room.connect(url, token);
    markLiveSession(true);
    if (role === 'host') {
      const existing = previewRef.current;
      if (existing.length > 0) {
        for (const track of existing) {
          await room.localParticipant.publishTrack(track);
        }
        previewRef.current = [];
      } else {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setState((s) => ({
        ...s,
        isJoined: true,
        isPublishing: true,
        localUid: 0,
        localVideoTrack: (cam?.track as LocalVideoTrack | undefined) ?? s.localVideoTrack,
        error: null,
      }));
    } else {
      await room.startAudio().catch(() => undefined);
      setState((s) => ({ ...s, isJoined: true, error: null }));
    }
    // LiveKit pushes refreshed tokens to connected participants; no client renewal needed.
  }, [bindRoom, role]);

  const join = useCallback(async (creds: AgoraCredentials) => {
    if (wantsLiveKit(creds)) {
      await joinLiveKit(creds);
      return;
    }
    const agora = getAgoraModule();
    if (!agora) {
      reportUnavailable();
      throw new Error(EXPO_GO_MESSAGE);
    }

    const permitted = await ensureLivePermissions();
    if (!permitted) {
      throw new Error('يجب السماح بالكاميرا والميكروفون لبدء البث');
    }

    if (!claimRtcEngine('live', SESSION_ID)) {
      throw new Error('هناك جلسة صوتية أخرى تعمل الآن');
    }
    await init(creds.agoraAppId ?? '');
    const engine = engineRef.current;
    if (!engine) {
      throw new Error('تعذر تهيئة محرك البث');
    }

    engine.enableAudio();
    engine.enableVideo();
    markLiveSession(true);

    if (role === 'host') {
      await engine.setChannelProfile(agora.ChannelProfileType.ChannelProfileLiveBroadcasting);
      await engine.setClientRole(agora.ClientRoleType.ClientRoleBroadcaster);
      const previewCode = engine.startPreview();
      if (previewCode !== 0) {
        throw new Error(`تعذر فتح الكاميرا (كود ${previewCode})`);
      }
    } else {
      await engine.setChannelProfile(agora.ChannelProfileType.ChannelProfileLiveBroadcasting);
      await engine.setClientRole(agora.ClientRoleType.ClientRoleAudience);
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingJoin.current) {
          pendingJoin.current = null;
          reject(new Error('انتهت مهلة الاتصال بقناة البث — تحقق من الإنترنت وحاول مجدداً'));
        }
      }, 20000);

      pendingJoin.current = { resolve, reject, timer };

      const code = engine.joinChannel(creds.agoraToken ?? '', creds.agoraChannel ?? '', creds.agoraUid ?? 0, {
        clientRoleType:
          role === 'host'
            ? agora.ClientRoleType.ClientRoleBroadcaster
            : agora.ClientRoleType.ClientRoleAudience,
        publishMicrophoneTrack: role === 'host',
        publishCameraTrack: role === 'host',
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });

      if (code !== 0) {
        clearTimeout(timer);
        pendingJoin.current = null;
        reject(new Error(`فشل الانضمام للقناة (كود ${code})`));
      }
    });

    if (creds.expiresIn && onTokenWillExpire) {
      scheduleTokenRenewal(creds.expiresIn);
    }
  }, [role, init, onTokenWillExpire, reportUnavailable, joinLiveKit]);

  const startPublishing = useCallback(async () => {
    if (role !== 'host') return;
    if (roomRef.current) {
      await roomRef.current.localParticipant.setCameraEnabled(true);
      await roomRef.current.localParticipant.setMicrophoneEnabled(true);
      setState((s) => ({ ...s, isPublishing: true }));
      return;
    }
    if (!engineRef.current) return;
    engineRef.current.muteLocalVideoStream(false);
    engineRef.current.muteLocalAudioStream(false);
    setState((s) => ({ ...s, isPublishing: true }));
  }, [role]);

  const stopPublishing = useCallback(() => {
    if (roomRef.current) {
      void roomRef.current.localParticipant.setCameraEnabled(false);
      void roomRef.current.localParticipant.setMicrophoneEnabled(false);
      setState((s) => ({ ...s, isPublishing: false }));
      return;
    }
    if (!engineRef.current) return;
    engineRef.current.muteLocalVideoStream(true);
    engineRef.current.muteLocalAudioStream(true);
    setState((s) => ({ ...s, isPublishing: false }));
  }, []);

  const switchCamera = useCallback(() => {
    const track = state.localVideoTrack;
    if (track) {
      facingRef.current = facingRef.current === 'user' ? 'environment' : 'user';
      void track.restartTrack({ facingMode: facingRef.current });
      return;
    }
    engineRef.current?.switchCamera();
  }, [state.localVideoTrack]);

  const muteAudio = useCallback((mute: boolean) => {
    const room = roomRef.current;
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(!mute);
      return;
    }
    const audio = previewRef.current.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;
    if (audio) {
      void (mute ? audio.mute() : audio.unmute());
      return;
    }
    engineRef.current?.muteLocalAudioStream(mute);
  }, []);

  const muteVideo = useCallback((mute: boolean) => {
    const room = roomRef.current;
    if (room) {
      void room.localParticipant.setCameraEnabled(!mute);
      return;
    }
    const video = previewRef.current.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
    if (video) {
      void (mute ? video.mute() : video.unmute());
      setState((s) => ({ ...s, localVideoTrack: mute ? null : video }));
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    engine.muteLocalVideoStream(mute);
    if (!mute) engine.startPreview();
  }, []);

  const startLocalPreview = useCallback(async (appId: string, provider?: 'livekit' | 'agora') => {
    if (wantsLiveKit(provider ? { provider } : undefined)) {
      if (!claimRtcEngine('live', SESSION_ID)) {
        setState((s) => ({ ...s, error: 'هناك جلسة صوتية أخرى تعمل الآن' }));
        return false;
      }
      const permitted = await ensureLivePermissions();
      if (!permitted) {
        setState((s) => ({ ...s, error: 'يجب السماح بالكاميرا والميكروفون' }));
        return false;
      }
      try {
        const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
        previewRef.current = tracks as Array<LocalVideoTrack | LocalAudioTrack>;
        const video = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
        markLiveSession(true);
        setState((s) => ({ ...s, isJoined: true, localUid: 0, localVideoTrack: video ?? null, error: null }));
        return true;
      } catch {
        setState((s) => ({ ...s, error: 'تعذر الوصول للكاميرا' }));
        return false;
      }
    }

    const agora = getAgoraModule();
    if (!agora) {
      reportUnavailable();
      return false;
    }

    const permitted = await ensureLivePermissions();
    if (!permitted) {
      setState((s) => ({ ...s, error: 'يجب السماح بالكاميرا والميكروفون' }));
      return false;
    }

    await init(appId);
    const engine = engineRef.current;
    if (!engine) return false;

    try {
      engine.enableAudio();
      engine.enableVideo();
      const code = engine.startPreview();
      if (code !== 0) {
        setState((s) => ({ ...s, error: `تعذر فتح الكاميرا (كود ${code})` }));
        return false;
      }
      markLiveSession(true);
      setState((s) => ({ ...s, isJoined: true, localUid: 0, error: null }));
      return true;
    } catch {
      setState((s) => ({ ...s, error: 'تعذر الوصول للكاميرا' }));
      return false;
    }
  }, [init, reportUnavailable]);

  const stopLocalPreview = useCallback(async () => {
    await stopPreviewTracks();
    const engine = engineRef.current;
    if (engine) {
      try {
        engine.stopPreview();
      } catch {
        // ignore
      }
    }
    setState((s) => ({ ...s, isJoined: false, localUid: null }));
  }, [stopPreviewTracks]);

  const leave = useCallback(async () => {
    clearRenewalTimer();
    if (pendingJoin.current) {
      clearTimeout(pendingJoin.current.timer);
      pendingJoin.current = null;
    }
    const room = roomRef.current;
    if (room && room.state !== ConnectionState.Disconnected) {
      await room.disconnect();
    }
    const engine = engineRef.current;
    if (!engine) return;
    await engine.leaveChannel();
    engine.stopPreview();
  }, []);

  const destroy = useCallback(async () => {
    await leave();
    await stopPreviewTracks();
    roomRef.current?.removeAllListeners();
    roomRef.current = null;
    engineRef.current?.unregisterEventHandler({} as never);
    engineRef.current?.release();
    engineRef.current = null;
    markLiveSession(false);
    releaseRtcEngine('live', SESSION_ID);
    setState((s) => ({
      ...s,
      isJoined: false,
      isPublishing: false,
      localVideoTrack: null,
      remoteVideoTrack: null,
      remoteUsers: [],
    }));
  }, [leave, stopPreviewTracks]);

  useEffect(() => {
    return () => {
      destroy().catch(() => {});
    };
  }, [destroy]);

  function scheduleTokenRenewal(expiresInSeconds: number) {
    clearRenewalTimer();
    const renewIn = Math.max(expiresInSeconds * 0.9 * 1000, 60000);
    renewTimer.current = setTimeout(() => {
      handleTokenRenewal();
    }, renewIn);
  }

  function clearRenewalTimer() {
    if (renewTimer.current) {
      clearTimeout(renewTimer.current);
      renewTimer.current = null;
    }
  }

  return {
    ...state,
    engine: engineRef.current,
    join,
    leave,
    destroy,
    startPublishing,
    stopPublishing,
    switchCamera,
    muteAudio,
    muteVideo,
    startLocalPreview,
    stopLocalPreview,
  };
}
