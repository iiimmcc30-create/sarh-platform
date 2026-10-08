import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { VerifiedInfoSheet } from '@/components/ui/VerifiedInfoSheet';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { ProfileTabs } from '@/components/feature/ProfileTabs';
import { ProfileStatsRow } from '@/components/feature/ProfileStatsRow';
import { GoldSellerLabel } from '@/components/feature/GoldSellerLabel';
import { SwipeTabPager } from '@/components/ui/SwipeTabPager';
import { ProfileActionsSkeleton, ProfileHeaderSkeleton } from '@/components/ui/skeleton';
import { useFocusEffect } from 'expo-router';
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
  PROFILE_EDIT_LABEL,
  PROFILE_SHARE_LABEL,
  profileStatusBarStyle,
  shouldPinProfileTabs,
} from '@/lib/profileHeader';
import { quickAccessBorderColor } from '@/lib/quickAccessSurface';
import { shouldShowVerifiedBadge } from '@/lib/verifiedBadge';
import { isSellerListNearEnd } from '@/services/sellerListingsPager';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';

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
  country?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  rating?: number | null;
  reviewCount?: number;
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
  initialTab?: ProfileTabKey;
  onAdsNearEnd?: () => void;
  /**
   * Profile request still in flight (no cached user yet): the identity block and
   * visitor actions render as skeletons in place; toolbar, tabs and tab content
   * keep their real positions, so nothing shifts when the user arrives.
   */
  loading?: boolean;
  /**
   * Own profile only: «من شاهد ملفك» entry under the stats (count of the last 30
   * days; null while loading). Omitted = no row.
   */
  profileViews?: { count: number | null; onPress: () => void };
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
  initialTab = 'posts',
  onAdsNearEnd,
  loading = false,
  profileViews,
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
  const hasRating = user.rating != null && (user.reviewCount ?? 0) > 0;
  const ratingLabel = hasRating ? user.rating!.toFixed(1) : null;
  const filledStars = hasRating ? Math.round(user.rating!) : 0;

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
                  iconSize={PROFILE_COVER_ICON_GLYPH}
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
                  iconSize={PROFILE_COVER_ICON_GLYPH}
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
                          source={uriSource(user.avatar)}
                          style={styles.avatarImg}
                          contentFit="cover"
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.avatarPlain}>
                      <Image
                        source={uriSource(user.avatar)}
                        style={styles.avatarImg}
                        contentFit="cover"
                      />
                    </View>
                  )}
                </Pressable>
              </Row>

              {/* Name directly under the avatar; rating stars on the opposite side (left in Arabic). */}
              <Stack gap="none">
                <Row
                  gap="sm"
                  align="center"
                  justify="between"
                  style={styles.nameRow}
                  testID="profile-name-row"
                >
                  <Pressable
                    testID="profile-name"
                    onPress={openVerifiedSheet}
                    disabled={!openVerifiedSheet}
                    accessibilityRole={openVerifiedSheet ? 'button' : undefined}
                    style={styles.nameCluster}
                  >
                    <Row gap="xs" align="center" style={styles.nameInner}>
                      <AppText
                        variant="cardTitle"
                        color="textPrimary"
                        numberOfLines={2}
                        style={styles.nameShell}
                      >
                        {displayName}
                      </AppText>
                      {user.verified ? (
                        <VerificationBadge size={PROFILE_NAME_BADGE_SIZE} tier={user.verifiedTier} />
                      ) : null}
                      <FounderBadge username={user.username} verificationBadgeSize={PROFILE_NAME_BADGE_SIZE} />
                    </Row>
                  </Pressable>
                  <Pressable
                    testID="profile-rating"
                    onPress={onRatePress}
                    disabled={!onRatePress}
                    style={({ pressed }) => [
                      styles.ratingRow,
                      pressed && onRatePress ? styles.ratingRowPressed : null,
                    ]}
                  >
                    <Row gap="xs" align="center">
                      <Row gap="none" align="center" style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <AppIcon
                            key={n}
                            name={hasRating && n <= filledStars ? 'star' : 'star-outline'}
                            size={11}
                            color={
                              hasRating && n <= filledStars
                                ? themeColors.gold
                                : themeColors.textSubtle
                            }
                          />
                        ))}
                      </Row>
                      {ratingLabel ? (
                        <AppText variant="caption" color="textPrimary">
                          {ratingLabel}
                        </AppText>
                      ) : null}
                      {(user.reviewCount ?? 0) > 0 ? (
                        <AppText variant="caption" color="textMuted">
                          ({user.reviewCount})
                        </AppText>
                      ) : null}
                    </Row>
                  </Pressable>
                </Row>

                <Row gap="sm" align="center">
                  <Pressable
                    onPress={openVerifiedSheet}
                    disabled={!openVerifiedSheet}
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

              {/* Stats (X-style «677 المتابعون»): compact, 12pt above (bio/handle), no dividers. */}
              <ProfileStatsRow stats={stats} style={styles.statsRow} />

              {/* «من شاهد ملفك» (own profile): one quiet row, no card. */}
              {isOwnProfile && profileViews ? (
                <Pressable
                  onPress={profileViews.onPress}
                  accessibilityRole="button"
                  accessibilityLabel="من شاهد ملفك"
                  style={({ pressed }) => [styles.viewsRow, pressed ? styles.viewsRowPressed : null]}
                  testID="profile-views-row"
                >
                  <Row gap="xs" align="center">
                    <AppIcon name="eye-outline" size={15} color={themeColors.textMuted} />
                    <AppText variant="caption" color="textSecondary">
                      من شاهد ملفك
                    </AppText>
                    {profileViews.count != null ? (
                      <AppText variant="label" color="textPrimary">
                        {formatStatCount(profileViews.count)}
                      </AppText>
                    ) : null}
                    <AppText variant="caption" color="textMuted">
                      · آخر 30 يوماً
                    </AppText>
                  </Row>
                </Pressable>
              ) : null}
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
            <Row gap="sm" align="center" style={[styles.actionsRow, inset]}>
              {onMessage ? (
                <SarhButton
                  title="مراسلة"
                  variant="secondary"
                  shape="pill"
                  leftIcon="chatbubble-outline"
                  onPress={onMessage}
                  style={[styles.actionBtnFlex, styles.pillBorder]}
                />
              ) : null}
              {onFollow ? (
                <SarhButton
                  title={isFollowing ? 'متابَع' : 'متابعة'}
                  variant={isFollowing ? 'secondary' : 'primary'}
                  shape="pill"
                  leftIcon={isFollowing ? 'checkmark-circle-outline' : 'person-add-outline'}
                  onPress={onFollow}
                  loading={followLoading}
                  style={[styles.actionBtnFlex, isFollowing ? styles.pillBorder : null]}
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
            tabsPinned ? { marginTop: spacing.md - insets.top, paddingTop: insets.top } : null,
          ]}
        >
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
          pageStyle={[styles.postsFeed, inset]}
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
    nameInner: {
      flexShrink: 1,
      minWidth: 0,
    },
    nameShell: {
      flexShrink: 1,
      minWidth: 0,
    },
    /** Stars hold the inline end of the name row (left in Arabic) and never shrink. */
    ratingRow: {
      paddingVertical: 2,
      flexShrink: 0,
    },
    /** Larger than the old 12px caption (15/500 label) on the stronger secondary token; still under the 18px name. */
    username: {
      writingDirection: 'ltr',
      alignSelf: 'flex-start',
    },
    usernamePress: {
      alignSelf: 'flex-start',
    },
    viewsRow: {
      alignSelf: 'flex-start',
      paddingVertical: 2,
    },
    viewsRowPressed: {
      opacity: 0.6,
    },
    ratingRowPressed: {
      opacity: 0.75,
    },
    starsRow: {
      gap: 2,
    },
    /** X spacing: 8 (Stack gap) + 4 = 12pt between the bio (or @handle) and the stats. */
    statsRow: {
      width: '100%',
      paddingTop: spacing.xs,
    },
    /** Clear gap: 8 (Stack gap) + 8 = 16pt between the @handle and the bio. */
    bio: {
      lineHeight: 22,
      paddingTop: spacing.sm,
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
    actionBtnFlex: {
      flexGrow: 1,
      flexShrink: 0,
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
