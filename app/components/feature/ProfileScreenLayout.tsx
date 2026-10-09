import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { VerifiedInfoSheet } from '@/components/ui/VerifiedInfoSheet';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { ProfileTabs } from '@/components/feature/ProfileTabs';
import { ProfileStatsRow } from '@/components/feature/ProfileStatsRow';
import { GoldSellerLabel } from '@/components/feature/GoldSellerLabel';
import { ProfileLinksRow } from '@/components/feature/ProfileLinksRow';
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
import { useAppChromeScroll } from '@/hooks/useAppChrome';
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
  profileStatusBarStyle,
  shouldPinProfileTabs,
} from '@/lib/profileHeader';
import { ABOUT_ACCOUNT_ROUTE, ABOUT_ACCOUNT_TITLE, profileRatingInline } from '@/lib/aboutAccount';
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
  const { colors: themeColors, scheme, isDark } = useTheme();
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const { onChromeScroll } = useAppChromeScroll();
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const { width: windowWidth } = useWindowDimensions();
  const profileTabs = useMemo(() => getProfileTabs(mode === 'own'), [mode]);
  /** Same swipe pager as /bookmarks: one index drives tab strip, indicator and page. */
  const tabPager = useSwipeTabPager({
    count: profileTabs.length,
    width: windowWidth,
    initialIndex: Math.max(0, profileTabs.findIndex((tab) => tab.key === initialTab)),
    // ProfileTabs animates transform / opacity only: follow the pager on the UI thread.
    nativeDriver: true,
  });
  const activeTab: ProfileTabKey = profileTabs[tabPager.index]?.key ?? 'posts';
  const { goTo: goToTab, jumpTo: jumpToTab } = tabPager;
  const selectTab = useCallback(
    (key: ProfileTabKey) => goToTab(Math.max(0, profileTabs.findIndex((tab) => tab.key === key))),
    [goToTab, profileTabs],
  );
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslate = useRef(new Animated.Value(12)).current;
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
  const [tabsPinned, setTabsPinned] = useState(false);
  const tabsPinnedRef = useRef(false);
  const tabsTopRef = useRef<number | null>(null);
  const onTabsLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // Natural offset, without the pinned spacer (which shifts the strip up by the inset).
      tabsTopRef.current = event.nativeEvent.layout.y + (tabsPinnedRef.current ? insets.top : 0);
    },
    [insets.top],
  );
  const updateTabsPinned = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = shouldPinProfileTabs(event.nativeEvent.contentOffset.y, tabsTopRef.current, insets.top);
      if (next === tabsPinnedRef.current) return;
      tabsPinnedRef.current = next;
      setTabsPinned(next);
    },
    [insets.top],
  );
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
    ]).start();
  }, [headerOpacity, headerTranslate]);

  useEffect(() => {
    // Visitors have no likes tab: an out-of-range index falls back to posts.
    if (tabPager.index >= profileTabs.length) jumpToTab(0);
  }, [jumpToTab, profileTabs.length, tabPager.index]);

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  const displayName = user.arabicName || user.displayName || user.username;
  const rating = profileRatingInline(user.rating, user.reviewCount);

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
      {
        key: 'posts',
        value: formatStatCount(user.postsCount),
        label: 'المنشورات',
      },
    ],
    [
      user.followersCount,
      user.followingCount,
      user.postsCount,
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
        stickyHeaderIndices={[1]}
        bottomInset="tabBar"
        padBottom="md"
        onScroll={(event) => {
          onChromeScroll(event);
          updateTabsPinned(event);
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
          <Row
            align="center"
            justify="between"
            pointerEvents="box-none"
            style={[styles.toolbar, inset, { paddingTop: spacing.xs + insets.top }]}
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
                    // Solid identity story ring: black in Light, white in Dark (same for everyone).
                    <View style={styles.avatarRing}>
                      <View style={styles.avatarClip}>
                        <Image
                          source={uriSource(avatarUrl(user.avatar, 'large'))}
                          style={styles.avatarImg}
                          contentFit="cover"
                        />
                      </View>
                    </View>
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

                <Row gap="xs" align="center" style={styles.handleRow} testID="profile-handle-row">
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
                  {/* One star + average + count (X-style, monochrome), same line as the handle. */}
                  <Pressable
                    testID="profile-rating"
                    onPress={onRatePress}
                    disabled={!onRatePress}
                    hitSlop={RATING_HIT_SLOP}
                    accessibilityRole={onRatePress ? 'button' : undefined}
                    accessibilityLabel={
                      rating ? `التقييم ${rating.average} من ${user.reviewCount ?? 0} تقييم` : 'لا توجد تقييمات بعد'
                    }
                    style={({ pressed }) => [
                      styles.ratingRow,
                      pressed && onRatePress ? styles.ratingRowPressed : null,
                    ]}
                  >
                    <Row gap="none" align="center" style={styles.ratingInner}>
                    <AppText variant="label" color="textSecondary" style={styles.ratingDot}>
                      ·
                    </AppText>
                    <AppIcon
                      name={rating ? 'star' : 'star-outline'}
                      size={PROFILE_RATING_STAR_SIZE}
                      color={rating ? themeColors.textPrimary : themeColors.textSecondary}
                    />
                    {rating ? (
                      <>
                        <AppText variant="label" color="textPrimary" style={styles.ratingNum} testID="profile-rating-average">
                          {rating.average}
                        </AppText>
                        <AppText variant="label" color="textSecondary" style={styles.ratingNum} testID="profile-rating-count">
                          {rating.count}
                        </AppText>
                      </>
                    ) : null}
                    </Row>
                  </Pressable>
                  {mode === 'visitor' && followsYou ? (
                    <AppText variant="caption" color="textSecondary" style={styles.followsYou} testID="profile-follows-you">
                      يتابعك
                    </AppText>
                  ) : null}
                  {/* «بائع ذهبي»: quiet gold caption beside the handle (Gold sellers only). */}
                  <GoldSellerLabel user={user} />
                </Row>
              </Stack>

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

        <View
          onLayout={onTabsLayout}
          style={[
            styles.tabsBar,
            // Pinned: a top-inset spacer on the same surface keeps the tabs below the status bar.
            tabsPinned ? { marginTop: spacing.md - insets.top } : null,
          ]}
        >
          {tabsPinned ? (
            <Row
              align="center"
              gap="sm"
              style={[styles.compactBar, inset, { paddingTop: insets.top }]}
              testID="profile-compact-bar"
            >
              {onBack ? (
                <SarhBackButton
                  size="sm"
                  chrome="glass"
                  iconSize={PROFILE_COVER_NAV_GLYPH}
                  onPress={onBack}
                  accessibilityLabel={PROFILE_BACK_LABEL}
                  style={styles.coverIcon}
                />
              ) : (
                <View style={styles.compactSide} />
              )}
              <Stack gap="none" style={styles.compactTitle}>
                <AppText variant="label" color="textPrimary" numberOfLines={1}>
                  {displayName}
                </AppText>
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {formatStatCount(user.postsCount)} من المنشورات
                </AppText>
              </Stack>
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
          ) : null}
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
/** Verified seal next to the 18px name (cardTitle). */
export const PROFILE_NAME_BADGE_SIZE = 18;
/** Single rating star on the handle line (15pt label). */
export const PROFILE_RATING_STAR_SIZE = 14;
/** Small controls on the name / handle lines still get a ≥ 44pt touch target. */
const BADGE_HIT_SLOP = { top: 13, bottom: 13, left: 10, right: 10 } as const;
const RATING_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 } as const;

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
    /** Rating sits right after the handle on the same line and never shrinks. */
    ratingRow: {
      paddingVertical: 2,
      flexShrink: 0,
    },
    ratingInner: {
      gap: 3,
    },
    ratingDot: {
      marginEnd: 1,
    },
    ratingNum: {
      writingDirection: 'ltr',
    },
    /** Larger than the old 12px caption (15/500 label) on the stronger secondary token; still under the 18px name. */
    username: {
      writingDirection: 'ltr',
      alignSelf: 'flex-start',
    },
    usernamePress: {
      alignSelf: 'flex-start',
      flexShrink: 1,
      minWidth: 0,
    },
    ratingRowPressed: {
      opacity: 0.75,
    },
    followsYou: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      flexShrink: 0,
    },
    compactBar: {
      minHeight: 44,
      paddingBottom: spacing.xs,
    },
    compactTitle: {
      flex: 1,
      minWidth: 0,
    },
    compactSide: {
      width: PROFILE_COVER_ICON_BUTTON_SIZE,
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
    avatarRing: {
      width: 92,
      height: 92,
      borderRadius: 46,
      padding: 2.5,
      backgroundColor: colors.electric,
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
      width: '100%',
      height: '100%',
      borderRadius: 44,
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
    postsFeed: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      minHeight: 200,
      gap: spacing.xs,
    },
  });
}
