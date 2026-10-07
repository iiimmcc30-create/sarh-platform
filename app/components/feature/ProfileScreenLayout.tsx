import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { ProfileTabs } from '@/components/feature/ProfileTabs';
import { SwipeTabPager } from '@/components/ui/SwipeTabPager';
import { ProfileActionsSkeleton, ProfileHeaderSkeleton } from '@/components/ui/skeleton';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ds } from '@/constants/designSystem';
import {
  AppText,
  SarhBackButton,
  SarhButton,
  SarhIconButton,
  resolveSarhButtonColorsForScheme,
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
  PROFILE_BACK_BUTTON_SIZE,
  PROFILE_BACK_LABEL,
  PROFILE_EDIT_LABEL,
  PROFILE_SHARE_LABEL,
} from '@/lib/profileHeader';
import { isSellerListNearEnd } from '@/services/sellerListingsPager';

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
  onEditAvatar?: () => void;
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
  onEditAvatar,
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
}: ProfileScreenLayoutProps) {
  const { colors: themeColors, scheme } = useTheme();
  const { gutter } = useLayout();
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
    <Screen edges={['top']} pattern={false}>
      <ScreenBody
        gutter={false}
        stickyHeaderIndices={[1]}
        bottomInset="tabBar"
        padBottom="md"
        onScroll={(event) => {
          onChromeScroll(event);
          if (activeTab !== 'ads' || !onAdsNearEnd) return;
          if (isSellerListNearEnd(event.nativeEvent)) onAdsNearEnd();
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColors.electricBright}
            />
          ) : undefined
        }
      >
        <Animated.View
          style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslate }],
          }}
        >
          {/* Profile cover across the top; the toolbar sits on it and the avatar overlaps its bottom edge. */}
          <View style={styles.coverBand} testID="profile-cover">
            {user.coverImage ? (
              <Image
                source={uriSource(user.coverImage)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel="غلاف الملف الشخصي"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.coverDefault]} />
            )}
          <Row align="center" justify="between" style={[styles.toolbar, inset]}>
            <Row gap="xs" align="center" style={styles.toolbarSide}>
              {/* Back sits at the inline start (right in Arabic); the shared back button flips the chevron. */}
              {onBack ? (
                <SarhBackButton
                  size="sm"
                  onPress={onBack}
                  color={themeColors.textPrimary}
                  accessibilityLabel={PROFILE_BACK_LABEL}
                  style={styles.backCircle}
                />
              ) : null}
            </Row>

            <Row gap="xs" align="center" style={styles.toolbarSide}>
              {mode === 'own' && onSettings ? (
                <SarhIconButton
                  icon="settings-outline"
                  chrome="ghost"
                  size="sm"
                  onPress={onSettings}
                  accessibilityLabel="إعدادات الحساب"
                />
              ) : null}
              {onMenu ? (
                <SarhIconButton
                  icon="menu-dots"
                  chrome={user.coverImage ? 'glass' : 'ghost'}
                  size="sm"
                  onPress={onMenu}
                  accessibilityLabel="المزيد"
                />
              ) : null}
            </Row>
          </Row>
          </View>

          {loading ? (
            <ProfileHeaderSkeleton style={inset} />
          ) : (
            <Row gap="md" align="start" style={inset}>
              <Stack gap="sm" fill>
                <Stack gap="xs">
                  <Row gap="xs" align="center" style={styles.nameRow}>
                    <AppText
                      variant="cardTitle"
                      color="textPrimary"
                      numberOfLines={2}
                      style={styles.nameShell}
                    >
                      {displayName}
                    </AppText>
                    {user.verified ? <VerificationBadge size={18} tier={user.verifiedTier} /> : null}
                    <FounderBadge username={user.username} verificationBadgeSize={18} />
                  </Row>

                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    @{user.username}
                  </AppText>

                  <Pressable
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
                </Stack>

                <Row gap="none" align="stretch" style={styles.statsRow}>
                  {stats.map((stat, index) => {
                    const body = (
                      <Stack gap="xs" align="center" style={styles.statItem}>
                        <AppText variant="cardTitle" color="textPrimary" align="center">
                          {stat.value}
                        </AppText>
                        <AppText variant="caption" color="textMuted" align="center">
                          {stat.label}
                        </AppText>
                      </Stack>
                    );

                    return (
                      <Row key={stat.key} gap="none" align="stretch" fill>
                        {index > 0 ? <View style={styles.statDivider} /> : null}
                        {stat.onPress ? (
                          <Pressable style={styles.statPress} onPress={stat.onPress}>
                            {body}
                          </Pressable>
                        ) : (
                          body
                        )}
                      </Row>
                    );
                  })}
                </Row>

                {user.bio ? (
                  <AppText variant="body" color="textSecondary" numberOfLines={4} style={styles.bio}>
                    {user.bio}
                  </AppText>
                ) : null}
              </Stack>

              <Pressable onPress={onAvatarPress} disabled={!onAvatarPress} style={styles.avatarCol}>
                {hasStoryRing ? (
                  <LinearGradient
                    colors={[
                      themeColors.electricBright,
                      themeColors.cyan,
                      // Light: all-black ring (black & white identity); Dark keeps its mint tail.
                      scheme === 'light' ? themeColors.glow : '#34D399',
                    ]}
                    style={styles.avatarRing}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <View style={styles.avatarClip}>
                      <Image
                        source={uriSource(user.avatar)}
                        style={styles.avatarImg}
                        contentFit="cover"
                      />
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={styles.avatarPlain}>
                    <Image
                      source={uriSource(user.avatar)}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  </View>
                )}
                {mode === 'own' && onEditAvatar ? (
                  <Pressable style={styles.cameraBtn} onPress={onEditAvatar} hitSlop={8}>
                    <AppIcon name="camera-outline" size={14} color="#fff" />
                  </Pressable>
                ) : null}
              </Pressable>
            </Row>
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
                  style={styles.pill}
                />
              ) : null}
              {onEditProfile ? (
                <SarhButton
                  title={PROFILE_EDIT_LABEL}
                  variant={PROFILE_ACTION_PILL_VARIANT}
                  shape={PROFILE_ACTION_PILL_SHAPE}
                  onPress={onEditProfile}
                  style={styles.pill}
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
                  style={styles.actionBtnFlex}
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
                  style={styles.actionBtnFlex}
                />
              ) : null}
            </Row>
          ) : null}
        </Animated.View>

        <View style={styles.tabsBar}>
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
    </Screen>
  );
}

/** Profile cover band height and how much of the avatar rides over it. */
export const PROFILE_COVER_HEIGHT = 112;
export const PROFILE_AVATAR_COVER_OVERLAP = 44;

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  /** Same border/background as the DS secondary (outline) button used by the pills. */
  const outline = resolveSarhButtonColorsForScheme(scheme, PROFILE_ACTION_PILL_VARIANT, 'default');
  return StyleSheet.create({
    toolbar: {
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
      minHeight: 44,
    },
    coverBand: {
      height: PROFILE_COVER_HEIGHT,
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
    backCircle: {
      width: PROFILE_BACK_BUTTON_SIZE,
      height: PROFILE_BACK_BUTTON_SIZE,
      borderRadius: PROFILE_BACK_BUTTON_SIZE / 2,
      borderWidth: 1,
      borderColor: outline.borderColor,
      backgroundColor: outline.backgroundColor,
    },
    nameRow: {
      flexWrap: 'nowrap',
      maxWidth: '100%',
    },
    nameShell: {
      flexShrink: 1,
      minWidth: 0,
    },
    ratingRow: {
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    ratingRowPressed: {
      opacity: 0.75,
    },
    starsRow: {
      gap: 2,
    },
    statsRow: {
      width: '100%',
      paddingTop: spacing.xs,
    },
    statItem: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
    },
    statPress: {
      flex: 1,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderMid,
      marginVertical: spacing.sm,
      alignSelf: 'stretch',
    },
    bio: {
      lineHeight: 22,
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
    /** Logical inset so the badge stays on the avatar's inner corner in both directions. */
    cameraBtn: {
      position: 'absolute',
      bottom: 0,
      end: 0,
      width: 28,
      height: 28,
      borderRadius: 16,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bgDeep,
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
