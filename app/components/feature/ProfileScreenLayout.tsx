import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { ProfileTabs } from '@/components/feature/ProfileTabs';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ds } from '@/constants/designSystem';
import {
  AppText,
  SarhBackButton,
  SarhButton,
  SarhIconButton,
} from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { duration } from '@/design-system/tokens';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { type ProfileTabKey } from '@/lib/profileTabs';
import { isSellerListNearEnd } from '@/services/sellerListingsPager';

export type { ProfileTabKey };

export type ProfileDisplayUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  verified: boolean;
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
  onShare: _onShare,
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
}: ProfileScreenLayoutProps) {
  const { colors: themeColors } = useTheme();
  const { gutter } = useLayout();
  const { onChromeScroll } = useAppChromeScroll();
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const [activeTab, setActiveTab] = useState<ProfileTabKey>(initialTab);
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
    if (!isOwnProfile && activeTab === 'likes') {
      setActiveTab('posts');
    }
  }, [activeTab, isOwnProfile]);

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
          <Row align="center" justify="between" style={[styles.toolbar, inset]}>
            <Row gap="xs" align="center" style={styles.toolbarSide}>
              {mode === 'own' && onEditProfile ? (
                <SarhIconButton
                  icon="pencil"
                  chrome="ghost"
                  size="sm"
                  onPress={onEditProfile}
                  accessibilityLabel="تعديل الملف"
                />
              ) : null}
              {mode === 'visitor' && onBack ? (
                <SarhBackButton
                  chrome="ghost"
                  size="sm"
                  onPress={onBack}
                  accessibilityLabel="رجوع"
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
              {mode === 'visitor' && onMenu ? (
                <SarhIconButton
                  icon="menu-dots"
                  chrome="ghost"
                  size="sm"
                  onPress={onMenu}
                  accessibilityLabel="المزيد"
                />
              ) : null}
            </Row>
          </Row>

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
                  {user.verified ? <VerificationBadge size={18} /> : null}
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
                  colors={[themeColors.electricBright, themeColors.cyan, '#34D399']}
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
            onTabChange={setActiveTab}
          />
        </View>

        <View style={[styles.postsFeed, inset]}>
          {activeTab === 'posts'
            ? postsContent
            : activeTab === 'ads'
              ? adsContent
              : activeTab === 'replies'
                ? repliesContent
                : activeTab === 'reposts'
                  ? repostsContent
                  : likesContent}
        </View>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors, _scheme: 'light' | 'dark') {
  return StyleSheet.create({
    toolbar: {
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
      minHeight: 44,
    },
    toolbarSide: {
      minWidth: ds.iconBtn.md,
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
    actionBtnFlex: {
      flexGrow: 1,
      flexShrink: 0,
    },
    tabsBar: {
      backgroundColor: 'transparent',
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
