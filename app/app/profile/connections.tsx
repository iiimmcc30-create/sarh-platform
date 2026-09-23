// SAFAT — Followers / Following lists
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet } from 'react-native';
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

type ConnectionsTab = 'followers' | 'following';

export default function ProfileConnectionsScreen() {
  const router = useRouter();
  const { me } = useAppUser();
  const { accessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
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
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);
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

  const handleFollowToggle = async (user: ConnectionUser) => {
    if (!accessToken || followLoadingId === user.id) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    if (user.id === me.id) return;

    setFollowLoadingId(user.id);
    try {
      const result = await setFollowUser(user.id, !user.isFollowing);
      if (!result) throw new Error('follow_failed');

      // The list endpoint resolves every row from PostgreSQL for the current
      // authenticated viewer. Never keep a local follow value after mutation.
      await loadConnections();
      if (__DEV__) {
        console.debug('[Follow] connections refetched after mutation', {
          viewerId: me.id,
          profileUserId: targetUserId,
          targetUserId: user.id,
          following: result.following,
          connectionType: activeTab,
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('[Follow] connection mutation failed', error);
      await loadConnections();
      Alert.alert('خطأ', 'تعذّرت المتابعة');
    } finally {
      setFollowLoadingId(null);
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
    const showFollowBtn = item.id !== me.id;

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
            avatarSize={USER_IDENTITY.listAvatarSize}
            avatarRadius={USER_IDENTITY.listAvatarRadius}
            avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
            avatarSide="end"
            nameLines={2}
            colors={colors}
            style={styles.identity}
            trailing={
              showFollowBtn ? (
                <SarhButton
                  title={item.isFollowing ? 'متابَع' : 'متابعة'}
                  variant={item.isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  loading={followLoadingId === item.id}
                  onPress={() => handleFollowToggle(item)}
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
          <Stack gap="none" align="center" fill style={styles.centered}>
            <ActivityIndicator size="large" color={colors.electricBright} />
          </Stack>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { justifyContent: 'center' },
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
    empty: {
      justifyContent: 'center',
      padding: spacing.xxxl,
    },
  });
}
