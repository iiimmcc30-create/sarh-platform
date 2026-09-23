// hooks/useLiveStream.ts
// Agora RTC hook — handles host broadcasting and viewer watching

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAgoraModule } from '@/lib/agora';
import { ensureLivePermissions } from '@/lib/livePermissions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreamRole = 'host' | 'viewer';

export interface AgoraCredentials {
  agoraAppId: string;
  agoraChannel: string;
  agoraToken: string;
  agoraUid?: number;
  expiresIn?: number;
}

export interface RemoteUser {
  uid: number;
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
}

interface UseLiveStreamOptions {
  role: StreamRole;
  onTokenWillExpire?: () => Promise<string>;
  onError?: (err: string) => void;
}

const EXPO_GO_MESSAGE =
  'البث المباشر يتطلب development build ولا يعمل داخل Expo Go.';

export function useLiveStream({ role, onTokenWillExpire, onError }: UseLiveStreamOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineRef = useRef<any>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJoin = useRef<{ resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  const [state, setState] = useState<LiveStreamState>({
    isJoined: false,
    isPublishing: false,
    localUid: null,
    remoteUsers: [],
    error: null,
    stats: {},
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

  const join = useCallback(async (creds: AgoraCredentials) => {
    const agora = getAgoraModule();
    if (!agora) {
      reportUnavailable();
      throw new Error(EXPO_GO_MESSAGE);
    }

    const permitted = await ensureLivePermissions();
    if (!permitted) {
      throw new Error('يجب السماح بالكاميرا والميكروفون لبدء البث');
    }

    await init(creds.agoraAppId);
    const engine = engineRef.current;
    if (!engine) {
      throw new Error('تعذر تهيئة محرك البث');
    }

    engine.enableAudio();
    engine.enableVideo();

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

      const code = engine.joinChannel(creds.agoraToken, creds.agoraChannel, creds.agoraUid ?? 0, {
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
  }, [role, init, onTokenWillExpire, reportUnavailable]);

  const startPublishing = useCallback(async () => {
    if (role !== 'host' || !engineRef.current) return;
    engineRef.current.muteLocalVideoStream(false);
    engineRef.current.muteLocalAudioStream(false);
    setState((s) => ({ ...s, isPublishing: true }));
  }, [role]);

  const stopPublishing = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.muteLocalVideoStream(true);
    engineRef.current.muteLocalAudioStream(true);
    setState((s) => ({ ...s, isPublishing: false }));
  }, []);

  const switchCamera = useCallback(() => {
    engineRef.current?.switchCamera();
  }, []);

  const muteAudio = useCallback((mute: boolean) => {
    engineRef.current?.muteLocalAudioStream(mute);
  }, []);

  const muteVideo = useCallback((mute: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.muteLocalVideoStream(mute);
    if (!mute) {
      engine.startPreview();
    }
  }, []);

  const startLocalPreview = useCallback(async (appId: string) => {
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
      setState((s) => ({ ...s, isJoined: true, localUid: 0, error: null }));
      return true;
    } catch {
      setState((s) => ({ ...s, error: 'تعذر الوصول للكاميرا' }));
      return false;
    }
  }, [init, reportUnavailable]);

  const stopLocalPreview = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.stopPreview();
    } catch {
      // ignore
    }
    setState((s) => ({ ...s, isJoined: false, localUid: null }));
  }, []);

  const leave = useCallback(async () => {
    clearRenewalTimer();
    if (pendingJoin.current) {
      clearTimeout(pendingJoin.current.timer);
      pendingJoin.current = null;
    }
    const engine = engineRef.current;
    if (!engine) return;
    await engine.leaveChannel();
    engine.stopPreview();
  }, []);

  const destroy = useCallback(async () => {
    await leave();
    engineRef.current?.unregisterEventHandler({} as never);
    engineRef.current?.release();
    engineRef.current = null;
  }, [leave]);

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
