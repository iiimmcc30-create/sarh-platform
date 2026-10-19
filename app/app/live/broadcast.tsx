// app/live/broadcast.tsx — شاشة البث المباشر (المضيف)
// Params come from /live/create: stream id + media credentials (LiveKit or Agora).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AgoraVideoView } from '@/components/live/AgoraVideoView';
import { LiveKitVideoView } from '@/components/live/LiveKitVideoView';
import { VideoSourceType } from '@/lib/agora';
import { colors, radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useYieldCouncilForLive } from '@/contexts/CouncilSessionContext';
import { useLiveSocket, type LiveCommentPayload } from '@/hooks/useLiveSocket';
import { useLiveStream } from '@/hooks/useLiveStream';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { showAlert } from '@/lib/confirmDialog';
import { API_BASE } from '@/services/api';

type Params = {
  streamId?: string;
  provider?: string;
  agoraAppId?: string;
  agoraChannel?: string;
  agoraToken?: string;
  agoraUid?: string;
  livekitUrl?: string;
  livekitToken?: string;
  livekitRoom?: string;
  expiresIn?: string;
};

export default function BroadcastScreen() {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { accessToken } = useAuth();
  const streamId = params.streamId;

  const [starting, setStarting] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState<LiveCommentPayload[]>([]);
  const [micOff, setMicOff] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const endedRef = useRef(false);

  useYieldCouncilForLive(true);
  const { isJoined, localUid, localVideoTrack, join, destroy, switchCamera, muteAudio, muteVideo } =
    useLiveStream({ role: 'host' });

  const api = useCallback(
    (action: 'start' | 'end') =>
      fetch(`${API_BASE}/api/livestreams/${streamId}?action=${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [accessToken, streamId],
  );

  useEffect(() => {
    if (!streamId || !accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        await join({
          provider: params.provider === 'agora' ? 'agora' : 'livekit',
          agoraAppId: params.agoraAppId,
          agoraChannel: params.agoraChannel,
          agoraToken: params.agoraToken,
          agoraUid: Number(params.agoraUid ?? 0),
          livekitUrl: params.livekitUrl,
          livekitToken: params.livekitToken,
          livekitRoom: params.livekitRoom,
          expiresIn: Number(params.expiresIn) || undefined,
        });
        const res = await api('start');
        if (!res.ok && res.status !== 409) throw new Error('تعذر بدء البث');
        if (!cancelled) setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setFatal(e instanceof Error ? e.message : 'تعذر بدء البث');
          setStarting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, accessToken]);

  useEffect(() => {
    return () => {
      if (!endedRef.current && streamId) {
        endedRef.current = true;
        void api('end').catch(() => {});
      }
      destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLiveSocket({
    streamId,
    accessToken,
    enabled: !starting && !fatal,
    onComment: (c) => setComments((prev) => [...prev.slice(-80), c]),
    onViewers: setViewers,
    onLike: () => setLikes((v) => v + 1),
    onLikes: setLikes,
  });

  const endBroadcast = useCallback(async () => {
    if (!endedRef.current) {
      endedRef.current = true;
      await api('end').catch(() => {});
    }
    await destroy().catch(() => {});
    router.replace('/(tabs)/live' as never);
  }, [api, destroy, router]);

  const confirmEnd = useCallback(() => {
    showAlert('إنهاء البث', 'هل تريد إنهاء البث المباشر؟', [
      { text: 'متابعة البث', style: 'cancel' },
      { text: 'إنهاء', style: 'destructive', onPress: () => void endBroadcast() },
    ]);
  }, [endBroadcast]);

  if (!streamId) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.title}>بيانات البث غير متوفرة</Text>
          <Pressable style={styles.pill} onPress={() => router.replace('/(tabs)/live' as never)}>
            <Text style={styles.pillText}>رجوع</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (fatal) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.title}>{fatal}</Text>
          <Pressable style={styles.pill} onPress={() => void endBroadcast()}>
            <Text style={styles.pillText}>رجوع</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {localVideoTrack && !camOff ? (
        <LiveKitVideoView track={localVideoTrack} mirror style={StyleSheet.absoluteFill} />
      ) : isJoined && !camOff ? (
        <AgoraVideoView
          local
          canvas={{ uid: localUid ?? 0, sourceType: VideoSourceType.VideoSourceCamera }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{starting ? 'جارٍ البدء…' : 'مباشر'}</Text>
          </View>
          <View style={styles.stat}>
            <AppIcon name="eye" size={13} color="#fff" />
            <Text style={styles.statText}>{viewers}</Text>
          </View>
          <View style={styles.stat}>
            <AppIcon name="heart" size={13} color="#fff" />
            <Text style={styles.statText}>{likes}</Text>
          </View>
        </View>
      </SafeAreaView>

      {starting ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.liveRed} />
        </View>
      ) : null}

      <View style={styles.comments} pointerEvents="none">
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={styles.bubble}>
              <Text style={styles.bubbleUser}>{item.arabicName ?? item.username}</Text>
              <Text style={styles.bubbleText}>{item.message}</Text>
            </View>
          )}
        />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <View style={styles.controls}>
          <Pressable
            style={styles.ctrl}
            onPress={() => {
              muteAudio(!micOff);
              setMicOff(!micOff);
            }}
            accessibilityLabel="الميكروفون"
          >
            <AppIcon name={micOff ? 'mic-off' : 'mic'} size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.ctrl}
            onPress={() => {
              muteVideo(!camOff);
              setCamOff(!camOff);
            }}
            accessibilityLabel="الكاميرا"
          >
            <AppIcon name={camOff ? 'video-off' : 'video'} size={22} color="#fff" />
          </Pressable>
          <Pressable style={styles.ctrl} onPress={switchCamera} accessibilityLabel="تبديل الكاميرا">
            <AppIcon name="refresh" size={22} color="#fff" />
          </Pressable>
          <Pressable style={[styles.ctrl, styles.endBtn]} onPress={confirmEnd} accessibilityLabel="إنهاء البث">
            <Text style={styles.endText}>إنهاء</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
    title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
    pill: { backgroundColor: colors.electricBright, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
    pillText: { ...typography.secondary, color: colors.onElectric },
    top: { position: 'absolute', top: 0, left: 0, right: 0 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    liveBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.liveRed, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    liveText: { ...typography.badge, color: '#fff' },
    stat: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4,
    },
    statText: { ...typography.caption, color: '#fff' },
    comments: { position: 'absolute', bottom: 110, left: 0, right: '35%', height: 220, paddingLeft: spacing.lg },
    bubble: {
      backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.md,
      padding: spacing.sm, marginBottom: 6, alignSelf: 'flex-start',
    },
    bubbleUser: { ...typography.badge, color: '#fff', marginBottom: 2 },
    bubbleText: { ...typography.secondary, color: '#fff' },
    bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
    ctrl: {
      minWidth: 48, height: 48, borderRadius: 24, paddingHorizontal: 12,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    endBtn: { backgroundColor: colors.liveRed },
    endText: { ...typography.badge, color: '#fff' },
  });
}
