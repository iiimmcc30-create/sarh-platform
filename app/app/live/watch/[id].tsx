// app/live/watch/[id].tsx
// Viewer screen: fetch media token (LiveKit or Agora) → join → watch host stream
// Navigation: router.push({ pathname: '/live/watch/[id]', params: { id: streamId } })
import { AppIcon } from '@/components/ui/FlaticonIcon';

import { Image } from '@/components/ui/AppImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgoraVideoView } from '@/components/live/AgoraVideoView';
import { HlsPlayerView } from '@/components/live/HlsPlayerView';
import { LiveKitVideoView } from '@/components/live/LiveKitVideoView';
import { describePhase } from '@/lib/liveViewerMode';
import { useLiveViewerAccess } from '@/hooks/useLiveViewerAccess';
import { isAgoraAvailable, VideoSourceType } from '@/lib/agora';
import { rtcProvider } from '@/lib/rtcProvider';
import { useYieldCouncilForLive } from '@/contexts/CouncilSessionContext';
import { useLiveStream } from '@/hooks/useLiveStream';
import { useLiveSocket } from '@/hooks/useLiveSocket';
import { colors, radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { sarh } from '@/constants/sarhTokens';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { avatarUrl } from '@/lib/listingMedia';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamInfo {
  id:          string;
  arabicTitle: string;
  title:       string;
  category:    string;
  viewers:     number;
  likes:       number;
  thumbnail?:  string;
  host: {
    id:          string;
    username:    string;
    arabicName:  string;
    avatar?:     string;
    verified:    boolean;
  };
}

interface LiveComment {
  id:          string;
  userId?:     string;
  username:    string;
  arabicName?: string;
  message:     string;
  isOffer:     boolean;
  offerAmount?: number;
  createdAt:   string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WatchScreen() {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { scheme } = useTheme();
  // Spinners sit on a dimmed video thumbnail: Light's brand black would vanish there.
  const overlayAccent = scheme === 'light' ? sarh.color.text : colors.electricBright;
  const router  = useRouter();
  const { id }  = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();

  const [stream, setStream]       = useState<StreamInfo | null>(null);
  const [comments, setComments]   = useState<LiveComment[]>([]);
  const [viewers, setViewers]     = useState(0);
  const [likes, setLikes]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [commentText, setComment] = useState('');
  const [hostUid, setHostUid]     = useState<number | null>(null);
  const flatRef = useRef<FlatList>(null);

  // One native audio engine: an active «المجالس» session is left before the stream starts.
  const liveKit = rtcProvider() === 'livekit';
  useYieldCouncilForLive(liveKit || isAgoraAvailable());
  const { isJoined, remoteUsers, remoteVideoTrack, error, join, leave } = useLiveStream({
    role: 'viewer',
    onTokenWillExpire: async () => {
      const resp = await fetch(`${API_BASE}/api/livestreams/${id}?action=token`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const { data } = await resp.json();
      return data.livekitToken || data.agoraToken;
    },
  });

  const access = useLiveViewerAccess({
    streamId: id,
    accessToken,
    enabled: !loading,
    joinWebRtc: (data) =>
      join({
        provider: data.provider as 'livekit' | 'agora' | undefined,
        agoraAppId: data.agoraAppId as string | undefined,
        agoraChannel: data.agoraChannel as string | undefined,
        agoraToken: data.agoraToken as string | undefined,
        agoraUid: data.agoraUid as number | undefined,
        livekitUrl: data.livekitUrl as string | undefined,
        livekitToken: data.livekitToken as string | undefined,
        livekitRoom: data.livekitRoom as string | undefined,
        expiresIn: data.expiresIn as number | undefined,
      }),
  });
  const view = describePhase(access.phase);

  // ── Fetch stream details ────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const streamResp = await fetch(`${API_BASE}/api/livestreams/${id}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const streamData = await streamResp.json();

        if (!streamData.success) {
          router.back();
          return;
        }

        const s: StreamInfo = streamData.data;
        setStream(s);
        setViewers(s.viewers);
        setLikes(s.likes);
        setComments((streamData.data.comments ?? []).reverse());

        setLoading(false);
      } catch (e) {
        setLoading(false);
        router.back();
      }
    })();

    return () => {
      leave().catch(() => {});
    };
  }, [id]);

  // ── Remote host video — first remote user is the host ──────────────────────
  useEffect(() => {
    if (remoteUsers.length > 0 && remoteUsers[0].uid) {
      setHostUid(remoteUsers[0].uid);
    }
  }, [remoteUsers]);

  const mapComment = useCallback((c: any): LiveComment => ({
    id: c.id,
    userId: c.userId,
    username: c.username ?? 'مستخدم',
    arabicName: c.arabicName,
    message: c.message ?? '',
    isOffer: c.isOffer ?? false,
    offerAmount: c.offerAmount,
    createdAt: c.createdAt ?? new Date().toISOString(),
  }), []);

  const { sendComment: emitComment, sendLike } = useLiveSocket({
    streamId: id,
    accessToken,
    enabled: !loading && Boolean(id),
    onComment: (comment) => {
      setComments((prev) => [...prev, mapComment(comment)]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onViewers: (count) => setViewers(count),
    onLike: () => setLikes((v) => v + 1),
    onEnded: () => {
      leave().catch(() => {});
      router.back();
    },
  });

  const sendComment = useCallback(() => {
    if (!commentText.trim()) return;
    emitComment(commentText.trim());
    setComment('');
  }, [commentText, emitComment]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        {stream?.thumbnail && (
          <Image source={{ uri: stream.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
        <View style={styles.loadingDim} />
        <ActivityIndicator size="large" color={overlayAccent} />
        <Text style={styles.loadingText}>جارٍ الانضمام إلى البث...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Video: WebRTC, CDN-backed HLS, or an explicit state (never a black screen) */}
      {access.phase.kind === 'hls' ? (
        <HlsPlayerView url={access.phase.url} style={StyleSheet.absoluteFill} onError={access.onHlsPlayerError} />
      ) : view.showWebRtcVideo ? (
        remoteVideoTrack ? (
          <LiveKitVideoView track={remoteVideoTrack} style={StyleSheet.absoluteFill} />
        ) : hostUid !== null ? (
          <AgoraVideoView
            canvas={{ uid: hostUid, sourceType: VideoSourceType.VideoSourceRemote }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.waitingOverlay]}>
            {stream?.thumbnail && (
              <Image source={{ uri: stream.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
            <View style={styles.loadingDim} />
            <ActivityIndicator color={overlayAccent} />
            <Text style={styles.loadingText}>في انتظار المضيف...</Text>
          </View>
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.waitingOverlay]}>
          {stream?.thumbnail && (
            <Image source={{ uri: stream.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
          )}
          <View style={styles.loadingDim} />
          {view.busy ? <ActivityIndicator color={overlayAccent} /> : null}
          {view.message ? <Text style={styles.stateText}>{view.message}</Text> : null}
          {view.canRetry ? (
            <Pressable style={styles.retryBtn} onPress={access.retry}>
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {view.badge ? (
        <View style={styles.hlsBadgeWrap} pointerEvents="none">
          <Text style={styles.hlsBadge}>{view.badge}</Text>
          {view.interactionNote ? <Text style={styles.hlsNote}>{view.interactionNote}</Text> : null}
        </View>
      ) : null}

      {/* Top bar */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <SafeAreaView edges={['top']}>
          <View style={styles.topRow}>

            {/* Live badge */}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>مباشر</Text>
            </View>

            {/* Host info */}
            {stream && (
              <UserProfileLink userId={stream.host.id} style={styles.hostRow}>
                {stream.host.avatar && (
                  <Image source={{ uri: avatarUrl(stream.host.avatar) }} style={styles.hostAvatar} contentFit="cover" />
                )}
                <View>
                  <Text style={styles.hostName}>{stream.host.arabicName}</Text>
                  <Text style={styles.hostHandle}>@{stream.host.username}</Text>
                </View>
              </UserProfileLink>
            )}

            {/* Viewer count */}
            <View style={styles.viewerPill}>
              <AppIcon name="eye" size={13} color="#fff" />
              <Text style={styles.viewerText}>{viewers.toLocaleString()}</Text>
            </View>

            {/* Close */}
            <Pressable style={styles.closeBtn} onPress={() => { leave(); router.back(); }}>
              <AppIcon name="close" size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Stream title */}
          {stream && (
            <Text style={styles.streamTitle} numberOfLines={1}>
              {stream.arabicTitle}
            </Text>
          )}
        </SafeAreaView>
      </View>

      {/* Comments feed */}
      <View style={styles.commentsWrapper} pointerEvents="box-none">
        <FlatList
          ref={flatRef}
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.isOffer && styles.offerBubble]}>
              <UserProfileLink userId={item.userId} disabled={!item.userId}>
                <Text style={styles.bubbleUser}>{item.arabicName ?? item.username}</Text>
              </UserProfileLink>
              {item.isOffer && item.offerAmount && (
                <Text style={styles.offerAmt}>عرض: {item.offerAmount.toLocaleString('ar-SA')} ر.س</Text>
              )}
              <Text style={styles.bubbleText}>{item.message}</Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.commentsList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />
      </View>

      {/* Bottom: input + like */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomBar}
      >
        <SafeAreaView edges={['bottom']}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="أضف تعليقاً..."
              placeholderTextColor={colors.textMuted}
              value={commentText}
              onChangeText={setComment}
              returnKeyType="send"
              onSubmitEditing={sendComment}
            />
            <Pressable
              style={[styles.sendBtn, !commentText.trim() && styles.sendBtnOff]}
              disabled={!commentText.trim()}
              onPress={sendComment}
            >
              <AppIcon name="send" size={17} color={colors.onElectric} />
            </Pressable>

            {/* Like button */}
            <Pressable
              style={styles.likeBtn}
              onPress={sendLike}
            >
              <AppIcon name="heart" size={22} color={colors.rose} />
              <Text style={styles.likesText}>{likes.toLocaleString()}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  loadingScreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  loadingDim:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  loadingText:  { ...typography.secondary, color: '#ccc', marginTop: 12 },
  waitingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stateText: { ...typography.secondary, color: '#fff', marginTop: 12, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryBtn: { marginTop: 16, backgroundColor: colors.electricBright, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { ...typography.secondary, color: colors.onElectric },
  hlsBadgeWrap: { position: 'absolute', top: 120, left: spacing.lg, right: spacing.lg, alignItems: 'flex-start' },
  hlsBadge: {
    ...typography.badge, color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden',
  },
  hlsNote: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 6, backgroundColor: 'rgba(0,0,0,0.4)', padding: 6, borderRadius: radius.md },

  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.liveRed, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:  { ...typography.badge, color: '#fff' },
  hostRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hostAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  hostName:  { ...typography.cardHeading, color: '#fff' },
  hostHandle: { ...typography.caption, color: 'rgba(255,255,255,0.6)' },
  viewerPill: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  viewerText: { ...typography.caption, color: '#fff' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  streamTitle: {
    ...typography.cardHeading, color: '#fff',
    paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 8,
  },

  commentsWrapper: { position: 'absolute', bottom: 90, left: 0, right: '35%', height: 240, paddingLeft: spacing.lg },
  commentsList:    { flex: 1 },
  bubble: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.md,
    padding: spacing.sm, marginBottom: 6, alignSelf: 'flex-start',
  },
  offerBubble:  { backgroundColor: 'rgba(200,40,40,0.7)', borderWidth: 1, borderColor: colors.liveRed },
  // Light text on the dark comment bubble in both schemes (same value Dark had).
  bubbleUser:   { ...typography.badge, color: sarh.color.text, marginBottom: 2 },
  offerAmt:     { ...typography.value, color: '#FFD700' },
  bubbleText:   { ...typography.secondary, color: '#fff' },

  bottomBar:    { position: 'absolute', bottom: 0, left: 0, right: 0 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.xl,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    color: '#fff', ...typography.secondary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  sendBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.electricBright, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.35 },
  likeBtn:    { alignItems: 'center' },
  likesText:  { ...typography.caption, color: '#fff', marginTop: 2 },
});
}
