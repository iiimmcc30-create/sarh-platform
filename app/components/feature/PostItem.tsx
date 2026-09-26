// SAFAT — Full-width post row (X-style feed), no floating cards.
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, uriSource } from '@/components/ui/AppImage';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { resolveAppFontFace } from '@/constants/fonts';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import {
  formatPostCardTimestampAr,
  formatPostClockAr,
  formatPostDateShortAr,
  formatViewsLabelAr,
} from '@/lib/formatRelativeTime';
import { Post } from '@/services/types';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { PostMediaGallery } from '@/components/feature/PostMediaGallery';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { requireAuth } from '@/lib/postInteractions';
import { fetchUserProfile, setFollowUser } from '@/services/users';

const HASHTAG_BLUE = '#1D9BF0';

const LIKE_RED = '#F91880';
const REPOST_GREEN = '#00BA7C';
const BOOKMARK_BLUE = '#1D9BF0';

interface PostItemProps {
  post: Post;
  variant?: 'feed' | 'detail' | 'profile';
  onPress?: () => void;
  onLike: () => void;
  onRepost?: () => void;
  onComment: () => void;
  onShare: () => void;
  onMenu: () => void;
  onBookmark?: () => void;
  onViewsChange?: (views: number) => void;
}

const TEXT_COLLAPSE_LINES = 8;

function formatCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}م`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}ألف`;
  }
  return String(n);
}

function PostBody({ text, style, lines }: { text: string; style: TextStyle; lines?: number }) {
  const parts = useMemo(() => {
    const tokens: { text: string; isTag: boolean }[] = [];
    const re = /(#[\u0600-\u06FF\w]+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) tokens.push({ text: text.slice(last, m.index), isTag: false });
      tokens.push({ text: m[0], isTag: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) tokens.push({ text: text.slice(last), isTag: false });
    return tokens;
  }, [text]);

  if (parts.length === 1 && !parts[0].isTag) {
    return (
      <AppText style={style} numberOfLines={lines}>
        {text}
      </AppText>
    );
  }

  return (
    <AppText style={style} numberOfLines={lines}>
      {parts.map((p, i) =>
        p.isTag ? (
          <AppText key={i} style={[style, { color: HASHTAG_BLUE }]}>
            {p.text}
          </AppText>
        ) : (
          <AppText key={i}>{p.text}</AppText>
        ),
      )}
    </AppText>
  );
}

function ActionBtn({
  icon,
  iconColor,
  count,
  textColor,
  onPress,
  style,
  countStyle,
  size = 18,
  filled = false,
  accessibilityLabel,
}: {
  icon: string;
  iconColor: string;
  count?: number;
  textColor: string;
  onPress: () => void;
  style: ViewStyle;
  countStyle: TextStyle;
  size?: number;
  filled?: boolean;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(opacity, { toValue: 0.5, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const pressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  return (
    <Pressable
      style={style}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, getRtlRow(), { alignItems: 'center', gap: 5 }]}>
        <AppIcon name={icon} size={size} color={iconColor} variant={filled ? 'sr' : 'rr'} />
        {count !== undefined && count > 0 ? (
          <AppText style={[countStyle, { color: textColor }]}>{formatCount(count)}</AppText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function PostItemComponent({
  post,
  variant = 'feed',
  onPress,
  onLike,
  onRepost,
  onComment,
  onShare,
  onMenu,
  onBookmark,
  onViewsChange,
}: PostItemProps) {
  const { styles, colors, scheme } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
    scheme: theme.scheme,
  }));

  const [expanded, setExpanded] = useState(variant === 'detail');
  const { me } = useApp();
  const { isAuthenticated } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const isOwnPost = !!me?.id && me.id === post.author.id;
  const showFollow = variant === 'detail' && !isOwnPost;

  const images = useMemo(() => {
    if (post.images && post.images.length > 0) return post.images;
    if (post.image) return [post.image];
    return [];
  }, [post.images, post.image]);

  const timestamp = useMemo(
    () => (post.createdAt ? formatPostCardTimestampAr(post.createdAt) : post.postedAt),
    [post.createdAt, post.postedAt],
  );

  const clock = useMemo(
    () => (post.createdAt ? formatPostClockAr(post.createdAt) : ''),
    [post.createdAt],
  );
  const dateLabel = useMemo(
    () => (post.createdAt ? formatPostDateShortAr(post.createdAt) : post.postedAt),
    [post.createdAt, post.postedAt],
  );

  const bodyText = post.arabicContent || post.content;
  const authorRating =
    typeof post.author.rating === 'number' ? post.author.rating.toFixed(1) : null;
  const handle = post.author.username ? `@${post.author.username}` : '';
  const viewsLabel =
    typeof post.views === 'number' ? formatViewsLabelAr(post.views) : null;

  useEffect(() => {
    if (!showFollow) return;
    let cancelled = false;
    void fetchUserProfile(post.author.id).then((profile) => {
      if (cancelled || !profile) return;
      setFollowing(profile.isFollowing);
    });
    return () => {
      cancelled = true;
    };
  }, [showFollow, post.author.id]);

  const onFollow = useCallback(async () => {
    if (!requireAuth(isAuthenticated, 'المتابعة') || followBusy || following === null) return;
    setFollowBusy(true);
    const next = !following;
    const result = await setFollowUser(post.author.id, next);
    if (result) setFollowing(result.following);
    setFollowBusy(false);
  }, [followBusy, following, isAuthenticated, post.author.id]);

  const feedChrome = variant === 'feed';
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const chromeShownRef = useRef(true);
  const [chromeInteractive, setChromeInteractive] = useState(true);

  useEffect(() => {
    chromeOpacity.setValue(1);
    chromeShownRef.current = true;
    setChromeInteractive(true);
  }, [chromeOpacity, post.id]);

  const toggleVideoChrome = useCallback(() => {
    const next = !chromeShownRef.current;
    chromeShownRef.current = next;
    setChromeInteractive(next);
    Animated.timing(chromeOpacity, {
      toValue: next ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [chromeOpacity]);

  const gallery = (
    <PostMediaGallery
      images={images}
      video={post.video}
      media={post.media}
      colors={colors}
      scheme={scheme}
      postId={post.id}
      variant={variant === 'detail' ? 'detail' : 'feed'}
      videoGestures={feedChrome}
      onToggleVideoChrome={feedChrome ? toggleVideoChrome : undefined}
      overlay={{
        authorName: post.author.arabicName || post.author.displayName,
        username: post.author.username,
        avatar: post.author.avatar,
        verified: post.author.verified,
        text: bodyText,
        likes: post.likes,
        comments: post.comments,
        reposts: post.reposts,
        views: post.views,
        liked: post.liked,
        reposted: post.reposted,
        bookmarked: post.bookmarked,
        isFollowing: following ?? false,
        showFollow,
        onLike,
        onComment,
        onRepost,
        onBookmark,
        onShare,
        onFollow,
      }}
      onViewRecorded={onViewsChange}
    />
  );

  const actions = (
          <View style={[styles.actions, getRtlRow()]}>
            <ActionBtn
              icon="chatbubble-ellipses-outline"
              iconColor={colors.textMuted}
              textColor={colors.textMuted}
              count={post.comments}
              onPress={onComment}
              style={styles.actionSlot}
              countStyle={styles.actionCount}
              accessibilityLabel="تعليق"
            />
            <ActionBtn
              icon="repeat-2"
              iconColor={post.reposted ? REPOST_GREEN : colors.textMuted}
              textColor={post.reposted ? REPOST_GREEN : colors.textMuted}
              count={post.reposts}
              onPress={onRepost ?? (() => {})}
              style={styles.actionSlot}
              countStyle={styles.actionCount}
              accessibilityLabel="إعادة نشر"
            />
            <ActionBtn
              icon={post.liked ? 'heart' : 'heart-outline'}
              iconColor={post.liked ? LIKE_RED : colors.textMuted}
              textColor={post.liked ? LIKE_RED : colors.textMuted}
              count={post.likes}
              onPress={onLike}
              style={styles.actionSlot}
              countStyle={styles.actionCount}
              filled={!!post.liked}
              accessibilityLabel="إعجاب"
            />
            {variant === 'detail' ? null : (
              <View
                style={[styles.actionSlot, getRtlRow(), styles.viewsSlot]}
                accessibilityRole="text"
                accessibilityLabel={`مشاهدات ${formatCount(post.views ?? 0)}`}
              >
                <AppIcon name="bar-chart-2" size={18} color={colors.textMuted} />
                <AppText style={[styles.actionCount, { color: colors.textMuted }]}>
                  {formatCount(post.views ?? 0)}
                </AppText>
              </View>
            )}
            <ActionBtn
              icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
              iconColor={post.bookmarked ? BOOKMARK_BLUE : colors.textMuted}
              textColor={colors.textMuted}
              onPress={onBookmark ?? (() => {})}
              style={styles.actionEndSlot}
              countStyle={styles.actionCount}
              filled={!!post.bookmarked}
              accessibilityLabel="حفظ"
            />
            <ActionBtn
              icon="share-up"
              iconColor={colors.textMuted}
              textColor={colors.textMuted}
              onPress={onShare}
              style={styles.actionEndSlot}
              countStyle={styles.actionCount}
              accessibilityLabel="مشاركة"
            />
          </View>
  );
