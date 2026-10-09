// SAFAT — Full-width post row (X-style feed), no floating cards.
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import {
  InteractionAction,
  InteractionBar,
  InteractionTrailingGroup,
  ShareAction,
} from '@/components/ui/InteractionActions';
import {
  INTERACTION_BOOKMARK_BLUE as BOOKMARK_BLUE,
  INTERACTION_LIKE_RED as LIKE_RED,
  interactionRepostColor,
} from '@/lib/interactionActions';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, uriSource } from '@/components/ui/AppImage';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
} from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { resolveAppFontFace } from '@/constants/fonts';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import {
  formatPostCardTimestampAr,
  formatPostClockAr,
  formatPostDateShortAr,
  formatViewsPartsAr,
} from '@/lib/formatRelativeTime';
import { Post } from '@/services/types';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { PostMediaGallery } from '@/components/feature/PostMediaGallery';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { requireAuth } from '@/lib/postInteractions';
import { fetchUserProfile, setFollowUser } from '@/services/users';
import {
  POST_HANDLE_FLEX_SHRINK,
  POST_DETAIL_BODY_FONT_SIZE,
  POST_DETAIL_BODY_LINE_HEIGHT,
  POST_DETAIL_MEDIA_RADIUS,
  POST_HANDLE_MIN_WIDTH,
  POST_ITEM_LAYOUT,
  POST_META_FONT_SIZE,
  POST_META_LINE_HEIGHT,
} from '@/components/feature/postItemLayout';
import { avatarUrl } from '@/lib/listingMedia';

const HASHTAG_BLUE = '#1D9BF0';

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
  /** True while this post's like/unlike request is in flight. */
  likePending?: boolean;
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
  likePending = false,
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
  const viewsParts =
    typeof post.views === 'number' ? formatViewsPartsAr(post.views) : null;

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
        verifiedTier: post.author.verifiedTier,
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

  // Same bar as the Media Viewer overlay (shared tokens: lib/interactionActions.ts).
  const actions = (
    <InteractionBar>
      <InteractionAction
        icon="chatbubble-ellipses-outline"
        color={colors.textSecondary}
        count={post.comments}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        onPress={onComment}
        label="تعليق"
      />
      <InteractionAction
        icon="repeat-2"
        color={post.reposted ? interactionRepostColor(scheme) : colors.textSecondary}
        count={post.reposts}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        onPress={onRepost ?? (() => {})}
        label="إعادة نشر"
      />
      <InteractionAction
        icon={post.liked ? 'heart' : 'heart-outline'}
        color={post.liked ? LIKE_RED : colors.textSecondary}
        count={post.likes}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        filled={!!post.liked}
        onPress={onLike}
        label="إعجاب"
        pending={likePending}
      />
      {variant === 'detail' ? null : (
        <InteractionAction
          readOnly
          icon="views-4-bars"
          color={colors.textSecondary}
          count={post.views ?? 0}
          formatCount={formatCount}
          countStyle={styles.actionCount}
          label={`مشاهدات ${formatCount(post.views ?? 0)}`}
        />
      )}
      <InteractionTrailingGroup>
        <InteractionAction
          icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
          color={post.bookmarked ? BOOKMARK_BLUE : colors.textSecondary}
          filled={!!post.bookmarked}
          onPress={onBookmark ?? (() => {})}
          label="حفظ"
        />
        <ShareAction color={colors.textSecondary} onPress={onShare} />
      </InteractionTrailingGroup>
    </InteractionBar>
  );

  // Post page (X layout): reply, repost, like, bookmark, share spread edge to edge
  // between two hairlines. Views live in the meta line above, so no views slot.
  const detailActions = (
    <InteractionBar variant="detail">
      <InteractionAction
        icon="chatbubble-ellipses-outline"
        color={colors.textSecondary}
        count={post.comments}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        onPress={onComment}
        label="تعليق"
      />
      <InteractionAction
        icon="repeat-2"
        color={post.reposted ? interactionRepostColor(scheme) : colors.textSecondary}
        count={post.reposts}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        onPress={onRepost ?? (() => {})}
        label="إعادة نشر"
      />
      <InteractionAction
        icon={post.liked ? 'heart' : 'heart-outline'}
        color={post.liked ? LIKE_RED : colors.textSecondary}
        count={post.likes}
        formatCount={formatCount}
        countStyle={styles.actionCount}
        filled={!!post.liked}
        onPress={onLike}
        label="إعجاب"
        pending={likePending}
      />
      <InteractionAction
        icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
        color={post.bookmarked ? BOOKMARK_BLUE : colors.textSecondary}
        filled={!!post.bookmarked}
        onPress={onBookmark ?? (() => {})}
        label="حفظ"
      />
      <ShareAction color={colors.textSecondary} onPress={onShare} />
    </InteractionBar>
  );

  if (variant === 'detail') {
    return (
      <View style={[styles.rowWrap, styles.detailWrap]} testID="post-detail">
        <View style={styles.detailPad}>
          <View style={[styles.detailHeader, getRtlRow()]}>
            <UserProfileLink userId={post.author.id}>
              <Image source={uriSource(avatarUrl(post.author.avatar))} style={styles.avatar} contentFit="cover" />
            </UserProfileLink>
            <UserProfileLink userId={post.author.id} style={styles.detailIdentity}>
              <View style={[styles.detailNameRow, getRtlRow()]}>
                <AppText style={styles.name} numberOfLines={1}>
                  {post.author.arabicName}
                </AppText>
                {post.author.verified ? <VerificationBadge size={14} tier={post.author.verifiedTier} /> : null}
                <FounderBadge username={post.author.username} verificationBadgeSize={14} />
                {authorRating ? (
                  <View style={[styles.ratingMini, getRtlRow()]}>
                    <AppIcon name="star" size={11} color={colors.gold} />
                    <AppText style={styles.ratingMiniText}>{authorRating}</AppText>
                  </View>
                ) : null}
              </View>
              {handle ? (
                <AppText style={styles.handle} numberOfLines={1}>
                  {handle}
                </AppText>
              ) : null}
            </UserProfileLink>
            {showFollow ? (
              // Primary pill (black in Light, white in Dark); bordered once followed.
              <Pressable
                onPress={() => void onFollow()}
                disabled={followBusy || following === null}
                style={({ pressed }) => [
                  styles.followBtn,
                  following ? styles.followBtnActive : null,
                  pressed && styles.menuBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={following ? 'متابَع' : 'متابعة'}
                testID="post-detail-follow"
              >
                <AppText style={[styles.followBtnText, following ? styles.followBtnTextActive : null]}>
                  {following ? 'متابَع' : 'متابعة'}
                </AppText>
              </Pressable>
            ) : null}
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

          {bodyText ? <PostBody text={bodyText} style={styles.detailBody} /> : null}

          {images.length > 0 || post.video || (post.media && post.media.length > 0) ? (
            <View style={styles.detailMedia}>{gallery}</View>
          ) : null}

          <View style={[styles.detailMeta, getRtlRow()]} testID="post-detail-meta">
            {clock ? <AppText style={styles.detailMetaText}>{clock}</AppText> : null}
            {clock && dateLabel ? <AppText style={styles.detailMetaText}>•</AppText> : null}
            {dateLabel ? <AppText style={styles.detailMetaText}>{dateLabel}</AppText> : null}
            {viewsParts ? (
              <>
                <AppText style={styles.detailMetaText}>•</AppText>
                <AppText style={styles.detailMetaText}>
                  <AppText style={styles.viewsCount}>{viewsParts.count}</AppText> {viewsParts.label}
                </AppText>
              </>
            ) : null}
          </View>
          <View style={styles.detailActions}>{detailActions}</View>
        </View>
      </View>
    );
  }

  const hasMedia = images.length > 0 || !!post.video || !!(post.media && post.media.length > 0);
  const longBody =
    bodyText.split('\n').length > TEXT_COLLAPSE_LINES || bodyText.length > 400;

  const authorMeta = (
    <View style={[styles.metaLine, getRtlRow()]}>
      <UserProfileLink userId={post.author.id} style={styles.metaInfo}>
        <View style={[styles.feedNameRow, getRtlRow()]}>
          <AppText style={styles.feedName} numberOfLines={1}>
            {post.author.arabicName}
          </AppText>
          {post.author.verified ? <VerificationBadge size={14} tier={post.author.verifiedTier} /> : null}
          <FounderBadge username={post.author.username} verificationBadgeSize={14} />
          {authorRating ? (
            <View style={[styles.ratingMini, getRtlRow()]}>
              <AppIcon name="star" size={11} color={colors.gold} />
              <AppText style={styles.ratingMiniText}>{authorRating}</AppText>
            </View>
          ) : null}
          {handle ? (
            <AppText style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">
              {handle}
            </AppText>
          ) : null}
          {timestamp ? (
            <>
              <AppText style={styles.metaDot}>·</AppText>
              <AppText style={styles.feedTime} numberOfLines={1}>
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
  );

  const caption = (
    <>
      {bodyText ? (
        <PostBody
          text={bodyText}
          style={styles.body}
          lines={expanded ? undefined : TEXT_COLLAPSE_LINES}
        />
      ) : null}
      {feedChrome && longBody ? (
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
    </>
  );

  const media = hasMedia ? <View style={styles.mediaWrap}>{gallery}</View> : null;
  const chromePointer = chromeInteractive ? 'auto' : 'none';

  if (!feedChrome) {
    return (
      <View style={styles.rowWrap}>
        <View style={[styles.row, getRtlRow()]}>
          <UserProfileLink userId={post.author.id}>
            <Image source={uriSource(avatarUrl(post.author.avatar))} style={styles.avatar} contentFit="cover" />
          </UserProfileLink>
          <View style={styles.main}>
            {authorMeta}
            <Pressable
              onPress={onPress}
              disabled={!onPress}
              style={({ pressed }) => [pressed && onPress ? styles.bodyPressed : null]}
            >
              {caption}
              {media}
            </Pressable>
            {actions}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowWrap}>
      <View style={[styles.row, getRtlRow()]}>
        <Animated.View style={{ opacity: chromeOpacity }} pointerEvents={chromePointer}>
          <UserProfileLink userId={post.author.id}>
            <Image source={uriSource(avatarUrl(post.author.avatar))} style={styles.avatar} contentFit="cover" />
          </UserProfileLink>
        </Animated.View>

        <View style={styles.main}>
          <Animated.View style={{ opacity: chromeOpacity }} pointerEvents={chromePointer}>
            {authorMeta}
          </Animated.View>

          <Animated.View style={{ opacity: chromeOpacity }} pointerEvents={chromeInteractive ? 'box-none' : 'none'}>
            <Pressable
              onPress={onPress}
              disabled={!onPress}
              style={({ pressed }) => [pressed && onPress ? styles.bodyPressed : null]}
            >
              {caption}
            </Pressable>
          </Animated.View>

          {media}

          <Animated.View style={{ opacity: chromeOpacity }} pointerEvents={chromePointer}>
            {actions}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function arePropsEqual(prev: PostItemProps, next: PostItemProps): boolean {
  if (prev.variant !== next.variant) return false;
  if (Boolean(prev.likePending) !== Boolean(next.likePending)) return false;
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
    a.author.verifiedTier === b.author.verifiedTier &&
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
      /** Post divider: one step stronger than borderHairline in both themes. */
      borderBottomColor: colors.borderStrong,
    },
    row: {
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: POST_ITEM_LAYOUT.rowGap,
    },
    avatar: {
      width: POST_ITEM_LAYOUT.avatar,
      height: POST_ITEM_LAYOUT.avatar,
      borderRadius: POST_ITEM_LAYOUT.avatar / 2,
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
    /** Feed header row: one line; name whole, handle shrinks to «@…», badges/dot/time fixed. */
    feedNameRow: {
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 4,
      minWidth: 0,
      maxWidth: '100%',
    },
    /** Shrinks (ellipsis) only once the handle is down to «@…», i.e. when it alone overflows. */
    feedName: {
      ...typography.cardHeading,
      ...resolveAppFontFace('600'),
      color: colors.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    /** «@username» is Latin: LTR inside the RTL row so «@» leads (same as the profile header). */
    feedHandle: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      fontSize: POST_META_FONT_SIZE,
      lineHeight: POST_META_LINE_HEIGHT,
      color: colors.textSecondary,
      flexShrink: POST_HANDLE_FLEX_SHRINK,
      minWidth: POST_HANDLE_MIN_WIDTH,
      writingDirection: 'ltr',
    },
    feedTime: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      fontSize: POST_META_FONT_SIZE,
      lineHeight: POST_META_LINE_HEIGHT,
      color: colors.textSecondary,
      flexShrink: 0,
    },
    /** Detail header «@username»: LTR, hugging the inline start (right in Arabic) like the profile header. */
    handle: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textSecondary,
      flexShrink: 1,
      writingDirection: 'ltr',
      alignSelf: 'flex-start',
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
    metaDot: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      color: colors.textSubtle,
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
    /** The action row's bottom hairline closes the post; no second divider. */
    detailWrap: {
      borderBottomWidth: 0,
    },
    detailPad: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    detailHeader: {
      alignItems: 'center',
      gap: 10,
    },
    detailIdentity: {
      flex: 1,
      minWidth: 0,
    },
    detailNameRow: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
    },
    /** Follow pill (X post page): filled theme primary, bordered once followed. */
    followBtn: {
      borderWidth: 1,
      borderColor: colors.electric,
      backgroundColor: colors.electric,
      borderRadius: radius.pill,
      paddingHorizontal: 16,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    followBtnActive: {
      borderColor: colors.borderStrong,
      backgroundColor: 'transparent',
    },
    followBtnText: {
      ...typography.secondary,
      ...resolveAppFontFace('700'),
      color: colors.onElectric,
    },
    followBtnTextActive: {
      color: colors.textPrimary,
    },
    /** Post page text: one step above the feed body (X post page). */
    detailBody: {
      ...typography.body,
      ...resolveAppFontFace('400'),
      color: colors.textPrimary,
      fontSize: POST_DETAIL_BODY_FONT_SIZE,
      lineHeight: POST_DETAIL_BODY_LINE_HEIGHT,
      marginTop: 12,
    },
    /** Media as a rounded card inside the post column (gallery measures its own width). */
    detailMedia: {
      width: '100%',
      marginTop: 12,
      borderRadius: POST_DETAIL_MEDIA_RADIUS,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
    },
    detailMetaText: {
      ...typography.secondary,
      ...resolveAppFontFace('400'),
      color: colors.textSecondary,
      flexShrink: 0,
    },
    viewsCount: {
      ...resolveAppFontFace('700'),
      color: colors.textPrimary,
    },
    /** Hairline above and below the action row, like the X post page. */
    detailActions: {
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
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
      overflow: 'hidden',
    },
    detailMeta: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 14,
    },
    /** Font face only - size, color and spacing come from the shared interaction tokens. */
    actionCount: {
      ...resolveAppFontFace('400'),
    },
  });
}

export default PostItem;
