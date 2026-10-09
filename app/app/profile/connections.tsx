// SAFAT — Followers / Following lists
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SkeletonRegion, UserIdentityRowSkeleton } from '@/components/ui/skeleton';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';

import { openUserProfile } from '@/lib/openUserProfile';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import {
  fetchUserConnectionsWithMeta,
  setFollowUser,
  type ConnectionUser,
} from '@/services/users';
import { showAlert } from '@/lib/confirmDialog';
import { quickAccessBorderColor } from '@/lib/quickAccessSurface';
import { resolveFollowButton, showFollowsYouTag } from '@/lib/followRelation';

type ConnectionsTab = 'followers' | 'following';

export default function ProfileConnectionsScreen() {
  const router = useRouter();
  const { me } = useAppUser();
  const { accessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const params = useLocalSearchParams<{
    userId?: string;
    tab?: string | string[];
    username?: string;
  }>();

  const targetUserId = (Array.isArray(params.userId) ? params.userId[0] : params.userId) || me.id;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const isOwnProfile = targetUserId === me.id;

  const [activeTab, setActiveTab] = useState<ConnectionsTab>(
    tabParam === 'following' ? 'following' : 'followers',
  );
  const [users, setUsers] = useState<ConnectionUser[]>([]);
  const [listHidden, setListHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Rows with a follow mutation in flight (blocks double taps; no spinner — optimistic). */
  const pendingFollowRef = useRef<Set<string>>(new Set());
  const loadedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveTab(tabParam === 'following' ? 'following' : 'followers');
  }, [tabParam, targetUserId]);

  const loadConnections = useCallback(async () => {
    const queryKey = `${targetUserId}:${activeTab}`;
    const isBackground = loadedQueryRef.current === queryKey;
    if (!isBackground) {
      setLoading(true);
      setUsers([]);
      setListHidden(false);
    }
    const data = await fetchUserConnectionsWithMeta(targetUserId, activeTab);
    loadedQueryRef.current = queryKey;
    setUsers(data.users);
    setListHidden(data.hidden === true);
    setLoading(false);
  }, [targetUserId, activeTab]);

  // Refresh when returning from a user profile so buttons never show stale state.
  useFocusEffect(
    useCallback(() => {
      if (authLoading || !isAuthenticated || !accessToken) return;
      void loadConnections();
    }, [accessToken, authLoading, isAuthenticated, loadConnections]),
  );

  const patchRow = useCallback((userId: string, isFollowing: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isFollowing } : u)));
  }, []);

  /**
   * X-style optimistic toggle: flip the capsule immediately, roll back on failure.
   * `setFollowUser` also patches the shared profile cache, so the profile screen
   * opens with the same state.
   */
  const handleFollowToggle = async (user: ConnectionUser) => {
    if (!accessToken) {
      showAlert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    if (user.id === me.id || pendingFollowRef.current.has(user.id)) return;

    const previous = user.isFollowing;
    const next = !previous;
    pendingFollowRef.current.add(user.id);
    patchRow(user.id, next);
    try {
      const result = await setFollowUser(user.id, next);
      if (!result) throw new Error('follow_failed');
      // Server is the source of truth (e.g. idempotent no-op): settle on its answer.
      if (result.following !== next) patchRow(user.id, result.following);
      if (__DEV__) {
        console.debug('[Follow] connection row toggled', {
          viewerId: me.id,
          profileUserId: targetUserId,
          targetUserId: user.id,
          following: result.following,
          connectionType: activeTab,
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('[Follow] connection mutation failed', error);
      patchRow(user.id, previous);
      showAlert('خطأ', 'تعذّرت المتابعة');
    } finally {
      pendingFollowRef.current.delete(user.id);
    }
  };

  const handleTabChange = (tab: ConnectionsTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setUsers([]);
  };

  const title = isOwnProfile
    ? activeTab === 'followers'
      ? 'متابعون'
      : 'يتابع'
    : params.username
      ? `@${params.username}`
      : 'المتابعات';

  const renderItem = ({ item, index }: { item: ConnectionUser; index: number }) => {
    const isSelf = item.id === me.id;
    const button = resolveFollowButton(item, isSelf);
    const followsYouTag = showFollowsYouTag(
      item,
      isSelf,
      isOwnProfile && activeTab === 'followers',
    );

    return (
      <>
        <Pressable
          style={[styles.userRow, { paddingHorizontal: gutter }]}
          onPress={() => openUserProfile(router, item.id)}
        >
          <UserIdentityRow
            avatarUri={item.avatar}
            displayName={item.arabicName || item.displayName || item.username}
            username={item.username}
            verified={item.verified}
            verifiedTier={item.verifiedTier}
            avatarSize={USER_IDENTITY.listAvatarSize}
            avatarRadius={USER_IDENTITY.listAvatarRadius}
            avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
            avatarSide="end"
            nameLines={2}
            colors={colors}
            style={styles.identity}
            handleAccessory={
              followsYouTag ? (
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={styles.followsYou}
                  testID={`connection-follows-you-${item.id}`}
                >
                  يتابعك
                </AppText>
              ) : null
            }
            trailing={
              button ? (
                // Same X capsule as the profile Follow button (pill + bold label).
                <SarhButton
                  title={button.title}
                  variant={button.variant}
                  size="sm"
                  shape="pill"
                  emphasis="strong"
                  onPress={() => void handleFollowToggle(item)}
                  style={button.variant === 'secondary' ? styles.pillBorder : undefined}
                  accessibilityLabel={button.title}
                  testID={`connection-follow-${item.id}`}
                />
              ) : null
            }
          />
        </Pressable>
        {index < users.length - 1 ? <SarhDivider /> : null}
      </>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={title} showBack />
      <ScreenBody scroll={false} gutter={false} padTop="md">
        <Row gap="xs" align="center" style={[styles.tabs, { marginHorizontal: gutter }]}>
          {(
            [
              { id: 'followers' as const, label: 'متابعون' },
              { id: 'following' as const, label: 'يتابع' },
            ]
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabBtn, active ? styles.tabBtnActive : null]}
                onPress={() => handleTabChange(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <AppText
                  variant="label"
                  color={active ? 'textPrimary' : 'textMuted'}
                  align="center"
                  style={active ? styles.tabTextActive : undefined}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </Row>

        {loading && users.length === 0 ? (
          // First load: identity rows (avatar, name, @handle, follow pill) in place.
          <SkeletonRegion>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <View key={i}>
                <UserIdentityRowSkeleton
                  trailingPill={84}
                  style={{ ...styles.userRow, paddingHorizontal: gutter }}
                />
                {i < 7 ? <SarhDivider /> : null}
              </View>
            ))}
          </SkeletonRegion>
        ) : (
          <FlatList
            key={activeTab}
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={users.length === 0 ? styles.emptyList : styles.list}
            ListEmptyComponent={
              <Stack gap="md" align="center" fill style={styles.empty}>
                <AppText variant="display">
                  {listHidden ? '🔒' : activeTab === 'followers' ? '👥' : '🔍'}
                </AppText>
                <AppText variant="body" color="textMuted" align="center">
                  {listHidden
                    ? 'قائمة «يتابع» خاصة بهذا الحساب'
                    : activeTab === 'followers'
                      ? 'لا يوجد متابعون بعد'
                      : 'لا تتابع أحداً بعد'}
                </AppText>
              </Stack>
            }
          />
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    /** Segmented control: a real selection affordance, not a decorative card. */
    tabs: {
      marginBottom: spacing.md,
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.xs,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    tabBtnActive: {
      backgroundColor: colors.bgElevated,
    },
    tabTextActive: {
      color: colors.textBrandStrong,
    },
    list: { paddingBottom: spacing.xl },
    emptyList: { flexGrow: 1 },
    userRow: {
      paddingVertical: spacing.md,
    },
    identity: {
      width: '100%',
    },
    /** «يتابعك»: same hairline tag as the profile header. */
    followsYou: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      flexShrink: 0,
    },
    /** Outlined «متابَع» capsule border — same token as the profile capsules. */
    pillBorder: {
      borderColor: quickAccessBorderColor(scheme),
    },
    empty: {
      justifyContent: 'center',
      padding: spacing.xxxl,
    },
  });
}
