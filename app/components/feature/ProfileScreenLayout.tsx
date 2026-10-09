import { Image, uriSource } from '@/components/ui/AppImage';
import { StoryRing } from '@/components/ui/StoryRing';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { VerifiedInfoSheet } from '@/components/ui/VerifiedInfoSheet';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { ProfileTabs } from '@/components/feature/ProfileTabs';
import { ProfileStatsRow } from '@/components/feature/ProfileStatsRow';
import { GoldSellerLabel } from '@/components/feature/GoldSellerLabel';
import { ProfileLinksRow } from '@/components/feature/ProfileLinksRow';
import { ProfileRatingStars } from '@/components/feature/ProfileRatingStars';
import { SwipeTabPager } from '@/components/ui/SwipeTabPager';
import { ProfileActionsSkeleton, ProfileHeaderSkeleton } from '@/components/ui/skeleton';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ds } from '@/constants/designSystem';
import { sarh } from '@/constants/sarhTokens';
import {
  AppText,
  SarhBackButton,
  SarhButton,
  SarhIconButton,
  resolveSarhIconButtonColors,
} from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { duration } from '@/design-system/tokens';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useSwipeTabPager } from '@/hooks/useSwipeTabPager';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getProfileTabs, type ProfileTabKey } from '@/lib/profileTabs';
import {
  PROFILE_ACTION_PILL_GAP,
  PROFILE_ACTION_PILL_HEIGHT,
  PROFILE_ACTION_PILL_PADDING_H,
  PROFILE_ACTION_PILL_SHAPE,
  PROFILE_ACTION_PILL_VARIANT,
  PROFILE_BACK_LABEL,
  PROFILE_COVER_ICON_BUTTON_SIZE,
  PROFILE_COVER_ICON_GLYPH,
  PROFILE_COVER_NAV_GLYPH,
  PROFILE_EDIT_LABEL,
  PROFILE_SHARE_LABEL,
  PROFILE_STICKY_BLUR_RADIUS,
  PROFILE_STICKY_TINT_OPACITY,
  profileStatusBarStyle,
  profileStickyHeaderRanges,
  shouldPinProfileTabs,
} from '@/lib/profileHeader';
import { ABOUT_ACCOUNT_ROUTE, ABOUT_ACCOUNT_TITLE } from '@/lib/aboutAccount';
import { quickAccessBorderColor } from '@/lib/quickAccessSurface';
import { shouldShowVerifiedBadge } from '@/lib/verifiedBadge';
import { isSellerListNearEnd } from '@/services/sellerListingsPager';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';
import { avatarUrl } from '@/lib/listingMedia';

export type { ProfileTabKey };

export type ProfileDisplayUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  /** Optional profile cover (User.coverImage); a clean default band when absent. */
  coverImage?: string;
  verified: boolean;
  verifiedTier?: string | null;
  /** ISO approval date of the verification (API `verifiedSince`); null/absent hides the date. */
  verifiedSince?: string | null;
  isAI?: boolean;
  bio?: string;
  /** Profile links under the bio (X-style); none renders nothing. */
  links?: { url: string; label?: string }[];
  country?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  rating?: number | null;
  reviewCount?: number;
  /** Account createdAt from the profile API. Shown as «تاريخ الانضمام» in «عن هذا الحساب». */
  createdAt?: string | null;
};

type ProfileScreenLayoutProps = {
  mode: 'own' | 'visitor';
  user: ProfileDisplayUser;
  postsContent: ReactNode;
  adsContent: ReactNode;
  repliesContent?: ReactNode;
  repostsContent?: ReactNode;
  likesContent?: ReactNode;
  onTabChange?: (tab: ProfileTabKey) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  onMenu?: () => void;
  onSettings?: () => void;
  onBack?: () => void;
  onShare?: () => void;
  onEditProfile?: () => void;
  /** Story ring tap (opens stories). Without a ring, the avatar opens full screen. */
  onAvatarPress?: () => void;
  hasStoryRing?: boolean;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
  onFollow?: () => void;
  onMessage?: () => void;
  onRatePress?: () => void;
  followLoading?: boolean;
  isFollowing?: boolean;
  /** True only when the API says this profile follows the viewer. */
  followsYou?: boolean;
  initialTab?: ProfileTabKey;
  onAdsNearEnd?: () => void;
  /**
   * Profile request still in flight (no cached user yet): the identity block and
   * visitor actions render as skeletons in place; toolbar, tabs and tab content
   * keep their real positions, so nothing shifts when the user arrives.
   */
  loading?: boolean;
};

function formatStatCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}م`;
  }
  if (n >= 10_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} ألف`;
  }
  return n.toLocaleString('en-US');
}

/**
 * The shared profile shell for both the own-profile tab and a visitor profile.
 *
 * Flat and content-first: identity, stats, bio, actions, then tabbed content.
 * No block here is a card — the only card language on a profile comes from
 * `ListingCard` inside `adsContent`, which this component never styles.
 */
export function ProfileScreenLayout({
  mode,
  user,
  postsContent,
  adsContent,
  repliesContent,
  repostsContent,
  likesContent,
  onTabChange,
  refreshing = false,
  onRefresh,
  onMenu,
  onSettings,
  onBack,
  onShare,
  onEditProfile,
  onAvatarPress,
  hasStoryRing = false,
  onFollowersPress,
  onFollowingPress,
  onFollow,
  onMessage,
  onRatePress,
  followLoading = false,
  isFollowing = false,
  followsYou = false,
  initialTab = 'posts',
  onAdsNearEnd,
  loading = false,
}: ProfileScreenLayoutProps) {
  const { colors: themeColors, isDark } = useTheme();
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const { width: windowWidth } = useWindowDimensions();
  const profileTabs = useMemo(() => getProfileTabs(mode === 'own'), [mode]);
  /** Same swipe pager as /bookmarks: one index drives tab strip, indicator and page. */
  const tabPager = useSwipeTabPager({
    count: profileTabs.length,
    width: windowWidth,
    initialIndex: Math.max(0, profileTabs.findIndex((tab) => tab.key === initialTab)),
    // UI-thread progress: ProfileTabs animates transform / opacity only (native-driver safe), and
    // the hook adds no JS scroll listener on native, so a swipe never re-renders React per frame.
    // (The JS driver re-committed ~16 animated views per frame on Fabric → visible lag.)
    nativeDriver: true,
  });
  const activeTab: ProfileTabKey = profileTabs[tabPager.index]?.key ?? 'posts';
  const { goTo: goToTab, jumpTo: jumpToTab } = tabPager;
  const selectTab = useCallback(
    (key: ProfileTabKey) => goToTab(Math.max(0, profileTabs.findIndex((tab) => tab.key === key))),
    [goToTab, profileTabs],
  );
  const [headerOpacity] = useState(() => new Animated.Value(0));
  const [headerTranslate] = useState(() => new Animated.Value(12));
  const isOwnProfile = mode === 'own';

  /**
   * Full-bleed cover (X-style): the screen ignores the top safe-area edge so the cover
   * runs behind the status bar; the toolbar and every text block still respect
   * `insets.top`. The status-bar style is owned here only while this screen is focused.
   */
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  /**
   * X-style sticky header: a fixed bar (back / more, then name + posts count) over the
   * user's cover. Scroll-linked layers (cover crop, frost, scrim) are opacity-only
   * interpolations of a native-driven scroll value (no JS per frame); the blurred image is
   * rendered once and never re-rendered by scrolling. The title fade runs on the native
   * driver once its threshold is crossed (state flips only at thresholds).
   */
  const [nameBottom, setNameBottom] = useState<number | null>(null);
  const sticky = profileStickyHeaderRanges({
    topInset: insets.top,
    coverHeight: PROFILE_COVER_HEIGHT,
    nameBottom,
  });
  const stickyHeight = sticky.headerHeight;
  const [scrollY] = useState(() => new Animated.Value(0));
  const [titleProgress] = useState(() => new Animated.Value(0));
  const [titleShown, setTitleShown] = useState(false);
  const titleShownRef = useRef(false);
  useEffect(() => {
    Animated.timing(titleProgress, {
      toValue: titleShown ? 1 : 0,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();
  }, [titleProgress, titleShown]);
  const [tabsPinned, setTabsPinned] = useState(false);
  const tabsPinnedRef = useRef(false);
  const tabsTopRef = useRef<number | null>(null);
  const onTabsLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // Direct child of the scroll content (no sticky wrapper), so y is the content offset.
      tabsTopRef.current = event.nativeEvent.layout.y;
    },
    [],
  );
  const updateStickyHeader = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // scrollY itself is driven on the native driver (ScreenBody nativeScrollY).
      const y = event.nativeEvent.contentOffset.y;
      const showTitle = y >= sticky.titleAt;
      if (showTitle !== titleShownRef.current) {
        titleShownRef.current = showTitle;
        setTitleShown(showTitle);
      }
      const next = shouldPinProfileTabs(y, tabsTopRef.current, stickyHeight);
      if (next === tabsPinnedRef.current) return;
      tabsPinnedRef.current = next;
      setTabsPinned(next);
    },
    [sticky.titleAt, stickyHeight],
  );
  /** Bottom of the name block in scroll-content coordinates (cover band + header Stack offset). */
  const onNameBlockLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      setNameBottom(PROFILE_COVER_HEIGHT + insets.top + y + height);
    },
    [insets.top],
  );
  const hasCover = Boolean(user.coverImage);
  /** Cover is sharp until it reaches the bar, then the bar holds the same crop (seamless). */
  const coverLayerOpacity = scrollY.interpolate({
    inputRange: [sticky.collapseAt - 1, sticky.collapseAt],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const frostOpacity = scrollY.interpolate({
    inputRange: [sticky.collapseAt, sticky.blurEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const tintOpacity = scrollY.interpolate({
    inputRange: [sticky.collapseAt, sticky.blurEnd],
    outputRange: [0, PROFILE_STICKY_TINT_OPACITY],
    extrapolate: 'clamp',
  });
  const titleTranslate = titleProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  /** Literal white (DS media/FAB white) over the frosted photo; theme text on the plain surface. */
  const stickyTextColor = hasCover ? sarh.color.fab : themeColors.textPrimary;
  const stickySubColor = hasCover ? sarh.color.fab : themeColors.textSecondary;
  /** Full-screen avatar / cover (shared in-app image viewer). */
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const openImage = useCallback((uri: string | null | undefined) => {
    if (!uri) return;
    setViewerUri(uri);
    setViewerOpen(true);
  }, []);
  const avatarPress =
    hasStoryRing && onAvatarPress ? onAvatarPress : user.avatar ? () => openImage(user.avatar) : undefined;
  const coverPress = user.coverImage ? () => openImage(user.coverImage) : undefined;

  /** Verified profiles: tapping the name / @handle / badge explains the badge. */
  const [verifiedSheetOpen, setVerifiedSheetOpen] = useState(false);
  const isVerified = !loading && shouldShowVerifiedBadge(user.verified);
  const openVerifiedSheet = isVerified ? () => setVerifiedSheetOpen(true) : undefined;
  /** Name / @handle: X-style «عن هذا الحساب» (joined, country, verified since). */
  const router = useRouter();
  const openAbout =
    !loading && user.id
      ? () => router.push({ pathname: ABOUT_ACCOUNT_ROUTE, params: { id: user.id } } as never)
      : undefined;

  const statusBarStyle = profileStatusBarStyle({
    hasCoverImage: Boolean(user.coverImage),
    isDark,
    tabsPinned,
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: duration.slow,
        useNativeDriver: true,
      }),
      Animated.spring(headerTranslate, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }),
    ]).start(({ finished }) => {
      // A remount of the header detaches these values, which stops the entrance mid-way and
      // left the whole header (name, stars, buttons) stuck semi-transparent. Snap to the end.
      if (!finished) {
        headerOpacity.setValue(1);
        headerTranslate.setValue(0);
      }
    });
  }, [headerOpacity, headerTranslate]);

  useEffect(() => {
    // Visitors have no likes tab: an out-of-range index falls back to posts.
    if (tabPager.index >= profileTabs.length) jumpToTab(0);
  }, [jumpToTab, profileTabs.length, tabPager.index]);

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  const displayName = user.arabicName || user.displayName || user.username;

  const stats = useMemo(
    () => [
      {
        key: 'followers',
        value: formatStatCount(user.followersCount),
        label: 'المتابعون',
        onPress: onFollowersPress,
      },
      {
        key: 'following',
        value: formatStatCount(user.followingCount),
        label: 'المتابَعون',
        onPress: onFollowingPress,
      },
      // Posts count lives only in the sticky header (X-style), not in the stats row.
    ],
    [
      user.followersCount,
      user.followingCount,
      onFollowersPress,
      onFollowingPress,
    ],
  );

  /** The tab strip divider spans the full width, so the gutter lives inside. */
  const inset = { paddingHorizontal: gutter };

  return (
    <Screen edges={[]} pattern={false}>
      {focused ? <StatusBar style={statusBarStyle} /> : null}
      <ScreenBody
        gutter={false}
        nativeScrollY={scrollY}
        bottomInset="tabBar"
        padBottom="md"
        onScroll={(event) => {
          // The shared chrome hide-on-scroll is bound by AppScrollView (calling it here too ran it twice per frame).
          updateStickyHeader(event);
          if (activeTab !== 'ads' || !onAdsNearEnd) return;
          if (isSellerListNearEnd(event.nativeEvent)) onAdsNearEnd();
        }}
        refreshControl={
          onRefresh ? (
            <AppRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }
      >
        <Animated.View style={{ opacity: headerOpacity }}>
          {/* Profile cover across the top, full bleed behind the status bar (no translate, so
              no gap ever opens above it); the toolbar sits on it below the top inset and the
              avatar overlaps its bottom edge. */}
          <View style={[styles.coverBand, { height: PROFILE_COVER_HEIGHT + insets.top }]} testID="profile-cover">
            {user.coverImage ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={coverPress}
                accessibilityRole="imagebutton"
                accessibilityLabel="عرض غلاف الملف الشخصي"
                testID="profile-cover-press"
              >
                <Image
                  source={uriSource(user.coverImage)}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityLabel="غلاف الملف الشخصي"
                />
              </Pressable>
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.coverDefault]} />
            )}
          </View>

          <Animated.View style={{ transform: [{ translateY: headerTranslate }] }}>
          {loading ? (
            <ProfileHeaderSkeleton style={inset} />
          ) : (
            <Stack gap="sm" style={inset}>
              {/* Avatar at the inline start (right in Arabic), overlapping the cover's bottom edge. */}
              <Row align="end" justify="start" style={styles.avatarRow} testID="profile-avatar-row">
                <Pressable
                  testID="profile-avatar"
                  onPress={avatarPress}
                  disabled={!avatarPress}
                  accessibilityRole={avatarPress ? 'imagebutton' : undefined}
                  accessibilityLabel="الصورة الشخصية"
                  style={styles.avatarCol}
                >
                  {hasStoryRing ? (
                    // Shared TikTok-style story ring (blue → green gradient, same in Dark & Light);
                    // the gap is the page background so the ring separates from the cover.
                    <StoryRing
                      size={PROFILE_STORY_RING_SIZE}
                      avatarSize={PROFILE_STORY_AVATAR_SIZE}
                      state="unseen"
                      strokeWidth={PROFILE_STORY_RING_STROKE}
                      gapColor={themeColors.screenRoot}
                    >
                      <View style={styles.avatarClip}>
                        <Image
                          source={uriSource(avatarUrl(user.avatar, 'large'))}
                          style={styles.avatarImg}
                          contentFit="cover"
                        />
                      </View>
                    </StoryRing>
                  ) : (
                    <View style={styles.avatarPlain}>
                      <Image
                        source={uriSource(avatarUrl(user.avatar, 'large'))}
                        style={styles.avatarImg}
                        contentFit="cover"
                      />
                    </View>
                  )}
                </Pressable>
              </Row>

              {/* Name directly under the avatar; @handle + «★ 4.8 (23)» on one line under it. */}
              <View onLayout={onNameBlockLayout}>
              <Stack gap="none" style={styles.nameBlock}>
                <Row
                  gap="xs"
                  align="center"
                  justify="start"
                  style={styles.nameRow}
                  testID="profile-name-row"
                >
                  {/* Name (and @handle) open «عن هذا الحساب»; the seal keeps the verified sheet. */}
                  <Pressable
                    testID="profile-name"
                    onPress={openAbout}
                    disabled={!openAbout}
                    accessibilityRole={openAbout ? 'button' : undefined}
                    accessibilityHint={openAbout ? ABOUT_ACCOUNT_TITLE : undefined}
                    style={styles.nameCluster}
                  >
                    <AppText
                      variant="cardTitle"
                      color="textPrimary"
                      numberOfLines={2}
                      style={styles.nameShell}
                    >
                      {displayName}
                    </AppText>
                  </Pressable>
                  {user.verified ? (
                    <Pressable
                      testID="profile-verified-badge"
                      onPress={openVerifiedSheet}
                      disabled={!openVerifiedSheet}
                      accessibilityRole={openVerifiedSheet ? 'button' : undefined}
                      accessibilityLabel="حساب موثّق"
                      hitSlop={BADGE_HIT_SLOP}
                      style={styles.nameBadge}
                    >
                      <VerificationBadge size={PROFILE_NAME_BADGE_SIZE} tier={user.verifiedTier} />
                    </Pressable>
                  ) : null}
                  <FounderBadge username={user.username} verificationBadgeSize={PROFILE_NAME_BADGE_SIZE} />
                </Row>

                {/* @handle (+ «يتابعك» / gold seller) at the inline start; five stars pushed to the far
                    end (left in RTL) with space-between. The handle truncates first. */}
                <Row gap="sm" align="center" justify="between" style={styles.handleRow} testID="profile-handle-row">
                  <Row gap="xs" align="center" style={styles.handleCluster}>
                    <Pressable
                      onPress={openAbout}
                      disabled={!openAbout}
                      style={styles.usernamePress}
                      testID="profile-username-press"
                    >
                      <AppText
                        variant="label"
                        color="textSecondary"
                        numberOfLines={1}
                        style={styles.username}
                        testID="profile-username"
                      >
                        @{user.username}
                      </AppText>
                    </Pressable>
                    {mode === 'visitor' && followsYou ? (
                      <AppText variant="caption" color="textSecondary" style={styles.followsYou} testID="profile-follows-you">
                        يتابعك
                      </AppText>
                    ) : null}
                    {/* «بائع ذهبي»: quiet gold caption beside the handle (Gold sellers only). */}
                    <GoldSellerLabel user={user} />
                  </Row>
                  <ProfileRatingStars rating={user.rating} reviewCount={user.reviewCount} onPress={onRatePress} />
                </Row>
              </Stack>
              </View>

              {/* Bio under the @handle (clear 16pt gap): readable standard white / near-black, regular weight. */}
              {user.bio ? (
                <AppText
                  variant="body"
                  color="textPrimary"
                  numberOfLines={4}
                  style={styles.bio}
                  testID="profile-bio"
                >
                  {user.bio}
                </AppText>
              ) : null}

              <ProfileLinksRow links={user.links} style={styles.links} />

              {/* Stats (X-style «677 المتابعون»): compact, 12pt above (bio/handle), no dividers. */}
              <ProfileStatsRow stats={stats} style={styles.statsRow} />
            </Stack>
          )}

          {/* My Profile only: equal outline pills above the tabs (Share + Edit Profile). */}
          {isOwnProfile && (onShare || onEditProfile) ? (
            <Row gap="md" align="center" style={[styles.ownActionsRow, inset]}>
              {onShare ? (
                <SarhButton
                  title={PROFILE_SHARE_LABEL}
                  variant={PROFILE_ACTION_PILL_VARIANT}
                  shape={PROFILE_ACTION_PILL_SHAPE}
                  onPress={onShare}
                  style={[styles.pill, styles.pillBorder]}
                />
              ) : null}
              {onEditProfile ? (
                <SarhButton
                  title={PROFILE_EDIT_LABEL}
                  variant={PROFILE_ACTION_PILL_VARIANT}
                  shape={PROFILE_ACTION_PILL_SHAPE}
                  onPress={onEditProfile}
                  style={[styles.pill, styles.pillBorder]}
                />
              ) : null}
            </Row>
          ) : null}

          {/* Other user's profile: the original Follow + Message actions only (share stays in the ⋯ menu). */}
          {loading && mode === 'visitor' ? <ProfileActionsSkeleton style={inset} /> : null}

          {mode === 'visitor' && (onFollow || onMessage) ? (
            // X capsules: two equal full-row pills, bold text only. Row order follows the
            // reference (RTL): «رسالة» outlined at the inline start, «تابِع» filled beside it.
            <Row gap="sm" align="center" style={[styles.actionsRow, inset]} testID="profile-visitor-actions">
              {onMessage ? (
                <SarhButton
                  title="رسالة"
                  variant="secondary"
                  shape="pill"
                  emphasis="strong"
                  onPress={onMessage}
                  style={[styles.pill, styles.pillBorder]}
                  testID="profile-message"
                />
              ) : null}
              {onFollow ? (
                <SarhButton
                  title={isFollowing ? 'متابَع' : followsYou ? 'رد المتابعة' : 'تابِع'}
                  variant={isFollowing ? 'secondary' : 'primary'}
                  shape="pill"
                  emphasis="strong"
                  onPress={onFollow}
                  loading={followLoading}
                  style={[styles.pill, isFollowing ? styles.pillBorder : null]}
                  testID="profile-follow"
                />
              ) : null}
            </Row>
          ) : null}
          </Animated.View>
        </Animated.View>

        <View onLayout={onTabsLayout} style={styles.tabsBar} testID="profile-tabs-inline">
          <ProfileTabs
            isOwnProfile={isOwnProfile}
            activeTab={activeTab}
            onTabChange={selectTab}
            progress={tabPager.progress}
          />
        </View>

        <SwipeTabPager
          pager={tabPager}
          fit="content"
          keepMounted
          pageStyle={styles.postsFeed}
          renderPage={(page) => {
            const key = profileTabs[page]?.key;
            return key === 'posts'
              ? postsContent
              : key === 'ads'
                ? adsContent
                : key === 'replies'
                  ? repliesContent
                  : key === 'reposts'
                    ? repostsContent
                    : likesContent;
          }}
        />
      </ScreenBody>

      {/* X-style sticky header: fixed over the scroll view. The cover scrolls up into it, the
          bar keeps the same crop, then frosts (blurred cover + DS scrim) and the name + posts
          count fade in. No cover → the tab-bar theme surface. */}
      <View
        pointerEvents="box-none"
        style={[styles.stickyHeader, { height: stickyHeight }]}
        testID="profile-sticky-header"
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.stickyBg, { opacity: coverLayerOpacity }]}
          testID="profile-sticky-bg"
        >
          {hasCover ? (
            <>
              <Image
                source={uriSource(user.coverImage)}
                style={[styles.stickyCover, { height: sticky.coverFull, top: stickyHeight - sticky.coverFull }]}
                contentFit="cover"
              />
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: frostOpacity }]}>
                <Image
                  source={uriSource(user.coverImage)}
                  style={[styles.stickyCover, { height: sticky.coverFull, top: stickyHeight - sticky.coverFull }]}
                  contentFit="cover"
                  blurRadius={PROFILE_STICKY_BLUR_RADIUS}
                  testID="profile-sticky-blur"
                />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.stickyTint, { opacity: tintOpacity }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.stickySurface]} />
          )}
        </Animated.View>
          <Row
          align="center"
          justify="between"
          pointerEvents="box-none"
          style={[styles.toolbar, inset, { paddingTop: insets.top, paddingBottom: 0, height: stickyHeight }]}
        >
          <Row gap="xs" align="center" pointerEvents="box-none" style={styles.toolbarSide}>
            {/* Back sits at the inline start (right in Arabic); the shared back button flips the chevron. */}
            {onBack ? (
              <SarhBackButton
                size="sm"
                chrome="glass"
                iconSize={PROFILE_COVER_NAV_GLYPH}
                onPress={onBack}
                accessibilityLabel={PROFILE_BACK_LABEL}
                style={styles.coverIcon}
              />
            ) : null}
          </Row>

          <Animated.View
            pointerEvents="none"
            style={[styles.stickyTitle, { opacity: titleProgress, transform: [{ translateY: titleTranslate }] }]}
            testID="profile-sticky-title"
          >
            <AppText variant="label" numberOfLines={1} style={{ color: stickyTextColor }}>
              {displayName}
            </AppText>
            <AppText
              variant="caption"
              numberOfLines={1}
              style={[{ color: stickySubColor }, hasCover ? styles.stickySubOnCover : null]}
            >
              {formatStatCount(user.postsCount)} من المنشورات
            </AppText>
          </Animated.View>

          <Row gap="xs" align="center" pointerEvents="box-none" style={styles.toolbarSide}>
            {mode === 'own' && onSettings ? (
              <SarhIconButton
                icon="settings-outline"
                chrome="glass"
                size="sm"
                iconSize={PROFILE_COVER_ICON_GLYPH}
                style={styles.coverIcon}
                onPress={onSettings}
                accessibilityLabel="إعدادات الحساب"
              />
            ) : null}
            {onMenu ? (
              <SarhIconButton
                icon="menu-dots"
                chrome="glass"
                size="sm"
                iconSize={PROFILE_COVER_NAV_GLYPH}
                style={styles.coverIcon}
                onPress={onMenu}
                accessibilityLabel="المزيد"
              />
            ) : null}
          </Row>
        </Row>
      </View>

      {/* Tabs pin right under the sticky header (the in-content strip scrolls beneath it at the
          same spot, so the hand-off is seamless on native and web alike). */}
      {tabsPinned ? (
        <View style={[styles.tabsBar, styles.tabsPinned, { top: stickyHeight }]} testID="profile-tabs-pinned">
          <ProfileTabs
            isOwnProfile={isOwnProfile}
            activeTab={activeTab}
            onTabChange={selectTab}
            progress={tabPager.progress}
          />
        </View>
      ) : null}

      <VerifiedInfoSheet
        visible={verifiedSheetOpen}
        onClose={() => setVerifiedSheetOpen(false)}
        tier={user.verifiedTier}
        verifiedSince={user.verifiedSince}
      />
      {viewerUri ? (
        <ImageViewerModal visible={viewerOpen} images={[viewerUri]} onClose={() => setViewerOpen(false)} />
      ) : null}
    </Screen>
  );
}

/** Profile cover band height and how much of the avatar rides over it. */
export const PROFILE_COVER_HEIGHT = 112;
export const PROFILE_AVATAR_COVER_OVERLAP = 44;
/** Story-ring frame keeps the old 92px footprint; the photo matches the plain avatar's visible 82px. */
export const PROFILE_STORY_RING_SIZE = 92;
export const PROFILE_STORY_AVATAR_SIZE = 82;
/** ~3.5% of the ring diameter, leaving a 1.75px page-background gap before the photo. */
export const PROFILE_STORY_RING_STROKE = 3.25;
/** Verified seal next to the 18px name (cardTitle). */
export const PROFILE_NAME_BADGE_SIZE = 18;
/** Small controls on the name / handle lines still get a ≥ 44pt touch target. */
const BADGE_HIT_SLOP = { top: 13, bottom: 13, left: 10, right: 10 } as const;

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  /** Glass chrome (translucent fill + light white hairline) for controls over the cover. */
  const glass = resolveSarhIconButtonColors('default', 'glass');
  return StyleSheet.create({
    toolbar: {
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
      minHeight: 44,
    },
    /** Full screen width: the body has no gutter here, so the band runs edge to edge with square corners. */
    coverBand: {
      height: PROFILE_COVER_HEIGHT,
      width: '100%',
      alignSelf: 'stretch',
      marginHorizontal: 0,
      borderRadius: 0,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    /** Default cover: a quiet tint of the Sarh primary (no gradient, no shadow). */
    coverDefault: {
      backgroundColor: colors.electric,
      opacity: scheme === 'dark' ? 0.16 : 0.08,
    },
    toolbarSide: {
      minWidth: ds.iconBtn.md,
    },
    /** Back / more / settings on the cover: round glass, one step smaller (fill comes from the glass chrome). */
    coverIcon: {
      width: PROFILE_COVER_ICON_BUTTON_SIZE,
      height: PROFILE_COVER_ICON_BUTTON_SIZE,
      minWidth: PROFILE_COVER_ICON_BUTTON_SIZE,
      minHeight: PROFILE_COVER_ICON_BUTTON_SIZE,
      borderRadius: PROFILE_COVER_ICON_BUTTON_SIZE / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: glass.borderColor,
    },
    /** Avatar sits alone at the inline start; the row only reserves its visible lower part. */
    avatarRow: {
      width: '100%',
    },
    nameRow: {
      flexWrap: 'nowrap',
      width: '100%',
      maxWidth: '100%',
    },
    nameCluster: {
      flexShrink: 1,
      minWidth: 0,
    },
    nameBadge: {
      flexShrink: 0,
    },
    /** @handle · ★ 4.8 (23) — one line, the handle truncates first. */
    handleRow: {
      flexWrap: 'nowrap',
      width: '100%',
      maxWidth: '100%',
    },
    nameShell: {
      flexShrink: 1,
      minWidth: 0,
    },
    /** Clearer than the stack gap alone: avatar to name. */
    nameBlock: {
      marginTop: spacing.sm,
    },
    /** Larger than the old 12px caption (15/500 label) on the stronger secondary token; still under the 18px name. */
    username: {
      writingDirection: 'ltr',
      alignSelf: 'flex-start',
    },
    /** Centred on the handle row so the stars sit on the same visual line (was pinned to the row top). */
    /** Handle side of the row: shrinks (handle truncates) so the stars never get pushed off. */
    handleCluster: {
      flexShrink: 1,
      minWidth: 0,
      flexWrap: 'nowrap',
    },
    usernamePress: {
      alignSelf: 'center',
      flexShrink: 1,
      minWidth: 0,
    },
    followsYou: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      flexShrink: 0,
    },
    /** Fixed over the scroll view (absolute, top), above the content. */
    stickyHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      overflow: 'hidden',
    },
    stickyBg: {
      overflow: 'hidden',
    },
    /** Full cover-band height, bottom-aligned to the bar (top = bar − band) so the crop matches. */
    stickyCover: {
      position: 'absolute',
      left: 0,
      right: 0,
      width: '100%',
    },
    stickyTint: {
      backgroundColor: sarh.color.overlay,
    },
    /** No cover: the same surface as the sticky tab strip. */
    stickySurface: {
      backgroundColor: (scheme === 'light' ? ds.light : ds.dark).tabBar,
    },
    stickyTitle: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: spacing.sm,
    },
    stickySubOnCover: {
      opacity: 0.85,
    },
    /** 8 (Stack gap) + 12 = 20pt between the bio and the stats. */
    statsRow: {
      width: '100%',
      paddingTop: spacing.md,
    },
    /** Clear gap: 8 (Stack gap) + 8 = 16pt between the @handle and the bio. */
    bio: {
      lineHeight: 22,
      paddingTop: spacing.sm,
    },
    links: {
      width: '100%',
    },
    avatarCol: {
      position: 'relative',
      paddingTop: 2,
      // Top of the avatar sits over the cover, the rest on the page background.
      marginTop: -PROFILE_AVATAR_COVER_OVERLAP,
    },
    avatarPlain: {
      width: 88,
      height: 88,
      borderRadius: 44,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      borderWidth: 3,
      borderColor: colors.screenRoot,
    },
    avatarClip: {
      width: PROFILE_STORY_AVATAR_SIZE,
      height: PROFILE_STORY_AVATAR_SIZE,
      borderRadius: PROFILE_STORY_AVATAR_SIZE / 2,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },
    actionsRow: {
      paddingTop: spacing.md,
    },
    ownActionsRow: {
      paddingTop: spacing.md,
      gap: PROFILE_ACTION_PILL_GAP,
    },
    /** Outline pills on the profile: the softer quick-access hairline (colour only). */
    pillBorder: {
      borderColor: quickAccessBorderColor(scheme),
    },
    /** Equal-width outline pill (radius = height / 2 via shape="pill"). */
    pill: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minHeight: PROFILE_ACTION_PILL_HEIGHT,
      paddingHorizontal: PROFILE_ACTION_PILL_PADDING_H,
    },
    /** Sticky tabs: same opaque-ish surface as the bottom tab bar so posts never show through. */
    tabsBar: {
      backgroundColor: (scheme === 'light' ? ds.light : ds.dark).tabBar,
      marginTop: spacing.md,
    },
    /** Pinned copy of the tab strip under the fixed header. */
    tabsPinned: {
      position: 'absolute',
      left: 0,
      right: 0,
      marginTop: 0,
      zIndex: 9,
    },
    postsFeed: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      minHeight: 200,
      gap: spacing.xs,
    },
  });
}
