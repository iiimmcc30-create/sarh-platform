import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { storyPlaybackVideoUrl } from '@/constants/stories';
import { resolveMediaUrl } from '@/services/media';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { promptReport } from '@/services/reports';
import {
  REACTION_META,
  StoryGroup,
  StoryReactionType,
  deleteStory,
  fetchStoryViewers,
  recordStoryView,
  removeStoryReaction,
  replyToStory,
  setStoryReaction,
} from '@/services/stories';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { rtlForwardIcon } from '@/lib/rtl';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export type StoryViewerProps = {
  groups: StoryGroup[];
  startGroupIndex: number;
  currentUserId?: string;
  accessToken?: string | null;
  onClose: () => void;
  onRefresh: () => void;
  /** modal = overlay; screen = full route (no Modal wrapper) */
  presentation?: 'modal' | 'screen';
};

function preloadUri(uri?: string | null) {
  const resolved = resolveMediaUrl(uri);
  if (resolved) RNImage.prefetch(resolved).catch(() => {});
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'الآن';
  if (h < 24) return `${h} س`;
  return new Date(iso).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

export function StoryViewer({
  groups,
  startGroupIndex,
  currentUserId,
  accessToken,
  onClose,
  onRefresh,
  presentation = 'modal',
}: StoryViewerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createViewerStyles(c));
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [viewers, setViewers] = useState<
    Array<{ id: string; arabicName: string; avatar?: string | null; viewedAt: string }>
  >([]);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausedRef = useRef(false);
  const dismissY = useRef(new Animated.Value(0)).current;
  const [mediaReady, setMediaReady] = useState(false);

  const group = groups[groupIndex];
  const stories = group?.stories ?? [];
  const story = stories[storyIndex];
  const isOwn = !!currentUserId && group?.user.id === currentUserId;
  const videoUri = storyPlaybackVideoUrl(story)
    ? resolveMediaUrl(story!.mediaUrl!)
    : null;
  const imageUri = resolveMediaUrl(story?.thumbnail);
  const durationSec = Math.max(1, story?.duration || 5);

  useEffect(() => {
    setMediaReady(!videoUri);
    if (!videoUri) return;
    const timer = setTimeout(() => setMediaReady(true), 5000);
    return () => clearTimeout(timer);
  }, [story?.id, videoUri]);

  const handleVideoReady = useCallback(() => {
    setMediaReady(true);
  }, []);

  const goNextStory = useCallback(() => {
    if (storyIndex < stories.length - 1) {
      setStoryIndex((i) => i + 1);
      return;
    }
    if (groupIndex < groups.length - 1) {
      setGroupIndex((g) => g + 1);
      setStoryIndex(0);
      return;
    }
    onClose();
  }, [storyIndex, stories.length, groupIndex, groups.length, onClose]);

  const goPrevStory = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
      return;
    }
    if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex((g) => g - 1);
      setStoryIndex(Math.max(0, (prevGroup?.stories.length ?? 1) - 1));
      return;
    }
    onClose();
  }, [storyIndex, groupIndex, groups, onClose]);

  const dismissViewer = useCallback(() => {
    Animated.timing(dismissY, {
      toValue: SCREEN_H,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [dismissY, onClose]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    dismissY.setValue(0);
    setShowReactions(false);
  }, [story?.id, dismissY]);

  useEffect(() => {
    if (!story || !accessToken || isOwn) return;
    void recordStoryView(accessToken, story.id);
  }, [story?.id, accessToken, isOwn]);

  useEffect(() => {
    const nextStory = stories[storyIndex + 1];
    const nextGroup = groups[groupIndex + 1]?.stories?.[0];
    preloadUri(nextStory?.mediaUrl || nextStory?.thumbnail);
    preloadUri(nextGroup?.mediaUrl || nextGroup?.thumbnail);
  }, [storyIndex, groupIndex, stories, groups]);

  useEffect(() => {
    if (!story || !mediaReady) return;
    progress.setValue(0);
    animRef.current?.stop();
    if (paused) return;

    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: durationSec * 1000,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished && !pausedRef.current) goNextStory();
    });
    return () => animRef.current?.stop();
  }, [story?.id, durationSec, paused, goNextStory, progress, mediaReady]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          (Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx)) ||
          Math.abs(g.dx) > 24,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0 && Math.abs(g.dy) > Math.abs(g.dx)) {
            dismissY.setValue(g.dy);
          }
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 && Math.abs(g.dy) > Math.abs(g.dx)) {
            dismissViewer();
            return;
          }
          if (Math.abs(g.dx) > 60 && Math.abs(g.dx) > Math.abs(g.dy)) {
            if (g.dx < 0) goNextStory();
            else goPrevStory();
            dismissY.setValue(0);
            return;
          }
          Animated.spring(dismissY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
      }),
    [dismissY, dismissViewer, goNextStory, goPrevStory],
  );

  const handleReact = async (type: StoryReactionType) => {
    if (!accessToken || !story || busy) return;
    setBusy(true);
    try {
      if (story.myReaction === type) {
        const res = await removeStoryReaction(accessToken, story.id);
        story.myReaction = null;
        story.reactionsCount = res.reactionsCount;
      } else {
        const res = await setStoryReaction(accessToken, story.id, type);
        story.myReaction = res.type;
        story.reactionsCount = res.reactionsCount;
      }
      setStoryIndex((i) => i);
      onRefresh();
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل التفاعل');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = () => {
    if (!group || !story) return;
    Share.share({
      message: `شاهد قصة ${group.user.arabicName || group.user.displayName} على سرح 🐪\n${sarhProfileShareUrl(group.user.username)}`,
      title: 'سرح — قصة',
    });
  };

  const handleReply = async () => {
    if (!accessToken || !story || !replyText.trim() || busy) return;
    setBusy(true);
    try {
      const res = await replyToStory(accessToken, story.id, replyText.trim());
      setReplyText('');
      onClose();
      router.push({
        pathname: '/chat',
        params: {
          threadId: res.threadId,
          receiverId: res.receiverId,
          receiverName: group.user.arabicName || group.user.displayName,
          receiverAvatar: group.user.avatar || '',
        },
      });
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل إرسال الرد');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !story || busy) return;
    const confirmed = await confirmDestructive('حذف القصة', 'هل تريد حذف هذه القصة؟');
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await deleteStory(accessToken, story.id);
      if (result.ok) {
        onRefresh();
        onClose();
      } else {
        await alertMessage('خطأ', result.error || 'فشل حذف القصة');
      }
    } catch (err) {
      await alertMessage('خطأ', err instanceof Error ? err.message : 'فشل حذف القصة');
    } finally {
      setBusy(false);
    }
  };

  const openViewers = async () => {
    if (!accessToken || !story || !isOwn) return;
    setShowViewers(true);
    setPaused(true);
    try {
      const data = await fetchStoryViewers(accessToken, story.id);
      setViewers(data.viewers);
    } catch (err) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل التحميل');
    }
  };

  const openProfile = () => {
    if (!group || isOwn) return;
    onClose();
    router.push({ pathname: '/users/[id]', params: { id: group.user.id } });
  };

  if (!story || !group) return null;

  const content = (
    <Animated.View
      style={[
        styles.container,
        presentation === 'modal' && { transform: [{ translateY: dismissY }] },
      ]}
      {...panResponder.panHandlers}
    >
      {videoUri ? (
        <StoryVideoPlayer
          key={story.id}
          uri={videoUri}
          posterUri={imageUri}
          style={styles.bg}
          muted={muted}
          loop={false}
          autoPlay={!paused}
          nativeControls={false}
          onReady={handleVideoReady}
        />
      ) : (
        <Image source={{ uri: imageUri }} style={styles.bg} contentFit="cover" />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)', 'transparent']}
        style={[styles.topFade, { height: insets.top + 100 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.65)']}
        style={[styles.bottomFade, { height: insets.bottom + 180 }]}
        pointerEvents="none"
      />

      <View style={[styles.progressRow, { top: insets.top + 6 }]}>
        {stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width:
                    i < storyIndex
                      ? '100%'
                      : i === storyIndex
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.header, { top: insets.top + 18 }]}
        onPress={openProfile}
        disabled={isOwn}
      >
        <Image
          source={{ uri: resolveMediaUrl(group.user.avatar) }}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>
            {group.user.arabicName || group.user.displayName}
          </Text>
          <Text style={styles.meta}>{timeAgo(story.createdAt)}</Text>
        </View>
        {videoUri ? (
          <Pressable onPress={() => setMuted((m) => !m)} hitSlop={10} style={styles.iconBtn}>
            <AppIcon name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable onPress={handleShare} hitSlop={10} style={styles.iconBtn}>
          <AppIcon name="share-social-outline" size={20} color="#fff" />
        </Pressable>
        {isOwn ? (
          <>
            <Pressable onPress={openViewers} hitSlop={10} style={styles.iconBtn}>
              <AppIcon name="eye-outline" size={20} color="#fff" />
              <Text style={styles.viewsCount}>{story.viewsCount}</Text>
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={10} style={styles.iconBtn}>
              <AppIcon name="trash-outline" size={20} color="#fff" />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => promptReport('story', story.id, !!accessToken)}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <AppIcon name="flag-outline" size={20} color="#fff" />
          </Pressable>
        )}
        <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
          <AppIcon name="close" size={22} color="#fff" />
        </Pressable>
      </Pressable>

      <View style={styles.tapRow} pointerEvents="box-none">
        <Pressable
          style={{ flex: 1 }}
          onPress={goPrevStory}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={160}
        />
        <Pressable
          style={{ flex: 1 }}
          onPress={goNextStory}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={160}
        />
      </View>

      {(story.captionAr || story.caption) && (
        <Text style={[styles.caption, { bottom: insets.bottom + (isOwn ? 56 : 118) }]}>
          {story.captionAr || story.caption}
        </Text>
      )}

      {story.location ? (
        <View style={[styles.locationChip, { bottom: insets.bottom + (isOwn ? 88 : 150) }]}>
          <AppIcon name="location-outline" size={12} color="#fff" />
          <Text style={styles.locationText}>{story.location}</Text>
        </View>
      ) : null}

      {story.listing ? (
        <Pressable
          style={[styles.listingBtn, { bottom: insets.bottom + (isOwn ? 48 : 110) }]}
          onPress={() => {
            onClose();
            router.push({
              pathname: '/listing/[id]',
              params: { id: story.listing!.id },
            });
          }}
        >
          <AppIcon name="pricetag" size={16} color="#fff" />
          <Text style={styles.listingBtnText}>
            {story.listing.arabicTitle || story.listing.title}
          </Text>
          <AppIcon name={rtlForwardIcon()} size={14} color="rgba(255,255,255,0.8)" />
        </Pressable>
      ) : null}

      {!isOwn && accessToken ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}
        >
          {showReactions ? (
            <View style={styles.reactionsRow}>
              {REACTION_META.map((r) => (
                <Pressable
                  key={r.type}
                  onPress={() => {
                    void handleReact(r.type);
                    setShowReactions(false);
                  }}
                  style={[
                    styles.reactionChip,
                    story.myReaction === r.type && styles.reactionChipActive,
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.replyRow}>
            <Pressable
              onPress={() => setShowReactions((v) => !v)}
              onLongPress={() => void handleReact('love')}
              style={[
                styles.heartBtn,
                story.myReaction === 'love' && styles.heartBtnActive,
              ]}
            >
              <Text style={styles.heartEmoji}>{story.myReaction === 'love' ? '❤️' : '🤍'}</Text>
            </Pressable>
            <TextInput
              style={styles.replyInput}
              placeholder="أرسل رسالة..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => void handleReply()}
            />
            <Pressable
              onPress={() => void handleReply()}
              disabled={!replyText.trim() || busy}
              style={[styles.sendBtn, !replyText.trim() && { opacity: 0.35 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <AppIcon name="send" size={17} color="#fff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <Pressable
          style={[styles.ownerStats, { bottom: insets.bottom + 14 }]}
          onPress={openViewers}
        >
          <Text style={styles.ownerStatsText}>
            {story.viewsCount.toLocaleString('en-US')} مشاهدة ·{' '}
            {story.reactionsCount.toLocaleString('en-US')} تفاعل
          </Text>
        </Pressable>
      )}

      <Modal
        visible={showViewers}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowViewers(false);
          setPaused(false);
        }}
      >
        <View style={styles.viewersSheet}>
          <View style={styles.viewersCard}>
            <View style={styles.viewersHandle} />
            <Text style={styles.viewersTitle}>المشاهدات</Text>
            <FlatList
              data={viewers}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text style={styles.emptyViewers}>لا مشاهدات بعد</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.viewerRow}>
                  <Image
                    source={{ uri: resolveMediaUrl(item.avatar) }}
                    style={styles.viewerAvatar}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewerName}>{item.arabicName}</Text>
                    <Text style={styles.viewerTime}>{timeAgo(item.viewedAt)}</Text>
                  </View>
                </View>
              )}
            />
            <Pressable
              onPress={() => {
                setShowViewers(false);
                setPaused(false);
              }}
              style={styles.closeViewers}
            >
              <Text style={styles.closeViewersText}>إغلاق</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );

  if (presentation === 'screen') return content;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function createViewerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    bg: { ...StyleSheet.absoluteFillObject, width: SCREEN_W, height: SCREEN_H },
    topFade: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3,
    },
    bottomFade: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 3,
    },
    progressRow: {
      position: 'absolute',
      left: 8,
      right: 8,
      flexDirection: 'row',
      gap: 3,
      zIndex: 6,
    },
    progressTrack: {
      flex: 1,
      height: 2,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.32)',
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
    header: {
      position: 'absolute',
      left: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      zIndex: 6,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    username: { color: '#fff', ...typography.cardHeading },
    meta: { color: 'rgba(255,255,255,0.72)', ...typography.micro, marginTop: 1 },
    iconBtn: {
      padding: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewsCount: { color: '#fff', ...typography.caption, marginTop: 1 },
    tapRow: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      zIndex: 2,
    },
    caption: {
      position: 'absolute',
      left: 16,
      right: 16,
      color: '#fff',
      ...typography.body,
      lineHeight: 22,
      zIndex: 5,
    },
    locationChip: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(0,0,0,0.38)',
      zIndex: 5,
    },
    locationText: { color: '#fff', ...typography.micro },
    listingBtn: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.pill,
      zIndex: 5,
      maxWidth: '88%',
    },
    listingBtnText: {
      color: '#fff',
      ...typography.bodyStrong,
      flexShrink: 1,
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 10,
      gap: 8,
      zIndex: 6,
    },
    reactionsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 4,
    },
    reactionChip: {
      width: 44,
      height: 44,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reactionChipActive: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderWidth: 1.5,
      borderColor: '#fff',
    },
    reactionEmoji: { fontSize: 22 },
    replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heartBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    heartBtnActive: {
      backgroundColor: 'rgba(255,60,90,0.35)',
    },
    heartEmoji: { fontSize: 22 },
    replyInput: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.38)',
      borderRadius: radius.pill,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 11 : 9,
      color: '#fff',
      ...typography.secondary,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ownerStats: { position: 'absolute', alignSelf: 'center', zIndex: 5 },
    ownerStatsText: { color: 'rgba(255,255,255,0.85)', ...typography.caption },
    viewersSheet: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    viewersCard: {
      maxHeight: '58%',
      backgroundColor: colors.bgPrimary,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      paddingTop: spacing.sm,
    },
    viewersHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.md,
    },
    viewersTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    viewerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    viewerAvatar: { width: 40, height: 40, borderRadius: 20 },
    viewerName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    viewerTime: { ...typography.micro, color: colors.textMuted, marginTop: 2 },
    emptyViewers: {
      textAlign: 'center',
      color: colors.textMuted,
      paddingVertical: 28,
    },
    closeViewers: {
      marginTop: spacing.sm,
      alignItems: 'center',
      paddingVertical: 12,
    },
    closeViewersText: { color: colors.electric, ...typography.bodyStrong },
  });
}
