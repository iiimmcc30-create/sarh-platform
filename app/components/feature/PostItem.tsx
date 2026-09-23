// SAFAT — Full-width post row (X-style feed), no floating cards.
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
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

  return (
    <View style={styles.rowWrap}>
      <View style={[styles.row, getRtlRow()]}>
        <UserProfileLink userId={post.author.id}>
          <Image source={uriSource(post.author.avatar)} style={styles.avatar} contentFit="cover" />
        </UserProfileLink>

        <View style={styles.main}>
          <View style={[styles.metaLine, getRtlRow()]}>
            <UserProfileLink userId={post.author.id} style={styles.metaInfo}>
              <View style={[styles.nameRow, getRtlRow()]}>
                <AppText style={styles.name} numberOfLines={1}>
                  {post.author.arabicName}
                </AppText>
                {post.author.verified ? <VerificationBadge size={14} /> : null}
                {authorRating ? (
                  <View style={[styles.ratingMini, getRtlRow()]}>
                    <AppIcon name="star" size={11} color={colors.gold} />
                    <AppText style={styles.ratingMiniText}>{authorRating}</AppText>
                  </View>
                ) : null}
                {handle ? (
                  <AppText style={styles.handle} numberOfLines={1}>
                    {handle}
                  </AppText>
                ) : null}
                {variant !== 'detail' && timestamp ? (
                  <>
                    <AppText style={styles.metaDot}>·</AppText>
                    <AppText style={styles.metaMuted} numberOfLines={1}>
                      {timestamp}
                    </AppText>
                  </>
                ) : null}
              </View>
            </UserProfileLink>

            <Pressable
              hitSlop={14}
              onPress={onMenu}
              accessibilityRole="button"
              accessibilityLabel="المزيد"
              style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
            >
              <AppIcon name="ellipsis-vertical" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            onPress={onPress}
            disabled={!onPress || variant === 'detail'}
            style={({ pressed }) => [pressed && onPress ? styles.bodyPressed : null]}
          >
            <PostBody
              text={bodyText}
              style={styles.body}
              lines={expanded ? undefined : TEXT_COLLAPSE_LINES}
            />
            {variant === 'feed' &&
            (bodyText.split('\n').length > TEXT_COLLAPSE_LINES || bodyText.length > 400) ? (
              !expanded ? (
                <Pressable onPress={() => (onPress ? onPress() : setExpanded(true))} hitSlop={6}>
                  <AppText style={styles.showMore}>عرض المزيد</AppText>
                </Pressable>
              ) : (
                <Pressable onPress={() => setExpanded(false)} hitSlop={6}>
                  <AppText style={styles.showMore}>عرض أقل</AppText>
                </Pressable>
              )
            ) : null}

            {images.length > 0 || post.video || (post.media && post.media.length > 0) ? (
              <View style={styles.mediaWrap}>
                <PostMediaGallery
                  images={images}
                  video={post.video}
                  media={post.media}
                  colors={colors}
                  scheme={scheme}
                  postId={post.id}
                  onViewRecorded={onViewsChange}
                />
              </View>
            ) : null}
          </Pressable>

          {variant === 'detail' ? (
            <View style={[styles.detailMeta, getRtlRow()]}>
              {clock ? <AppText style={styles.metaMuted}>{clock}</AppText> : null}
              {clock && dateLabel ? <AppText style={styles.metaDot}>·</AppText> : null}
              {dateLabel ? <AppText style={styles.metaMuted}>{dateLabel}</AppText> : null}
              {viewsLabel ? (
                <>
                  <AppText style={styles.metaDot}>·</AppText>
                  <AppText style={styles.viewsMeta}>{viewsLabel}</AppText>
                </>
              ) : null}
            </View>
          ) : null}

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
            {variant !== 'detail' ? (
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
            ) : null}
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
        </View>
      </View>
    </View>
  );
}

function arePropsEqual(prev: PostItemProps, next: PostItemProps): boolean {
  if (prev.variant !== next.variant) return false;
  const a = prev.post;
  const b = next.post;
  return (
    a.id === b.id &&
    a.likes === b.likes &&
    a.reposts === b.reposts &&
    a.comments === b.comments &&
    a.views === b.views &&
    a.liked === b.liked &&
    a.reposted === b.reposted &&
    a.bookmarked === b.bookmarked &&
    a.arabicContent === b.arabicContent &&
    a.content === b.content &&
    a.image === b.image &&
    a.video === b.video &&
    a.images === b.images &&
    a.media === b.media &&
    a.postedAt === b.postedAt &&
    a.createdAt === b.createdAt &&
    a.author.id === b.author.id &&
    a.author.avatar === b.author.avatar &&
    a.author.verified === b.author.verified &&
    a.author.arabicName === b.author.arabicName &&
    a.author.username === b.author.username &&
    a.author.rating === b.author.rating
  );
}

export const PostItem = memo(PostItemComponent, arePropsEqual);

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    rowWrap: {
      backgroundColor: scheme === 'light' ? colors.bgSurface : colors.bgDeep,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    row: {
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.bgSurface,
      flexShrink: 0,
    },
    main: {
      flex: 1,
      minWidth: 0,
    },
    metaLine: {
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    metaInfo: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      maxWidth: '100%',
    },
    name: {
      ...typography.cardHeading,
      ...resolveAppFontFace('600'),
      color: colors.textPrimary,
      flexShrink: 1,
    },
    handle: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textMuted,
      flexShrink: 1,
    },
    ratingMini: {
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      flexShrink: 0,
    },
    ratingMiniText: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textSecondary,
    },
    metaMuted: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textMuted,
      flexShrink: 0,
    },
    metaDot: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textSubtle,
      flexShrink: 0,
    },
    viewsMeta: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textSecondary,
      flexShrink: 0,
    },
    menuBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    menuBtnPressed: {
      opacity: 0.55,
    },
    body: {
      ...typography.body,
      ...resolveAppFontFace('400'),
      color: colors.textPrimary,
      marginTop: 4,
      lineHeight: 24,
    },
    bodyPressed: {
      opacity: 0.92,
    },
    showMore: {
      ...typography.secondary,
      ...resolveAppFontFace('500'),
      color: colors.electricBright,
      marginTop: 4,
    },
    mediaWrap: {
      marginTop: 12,
      width: '100%',
    },
    detailMeta: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    actions: {
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 2,
    },
    actionSlot: {
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: 2,
    },
    actionEndSlot: {
      width: 36,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      flexShrink: 0,
    },
    actionCount: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
    },
    viewsSlot: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
  });
}

export default PostItem;
