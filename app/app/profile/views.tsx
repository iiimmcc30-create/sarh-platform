// «من شاهد ملفك» — last 30 days of profile viewers (paid perk).
// The server gates identities: non-subscribers receive only the count, so the
// locked state renders neutral placeholder rows (no real data behind them).
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { SkeletonRegion, UserIdentityRowSkeleton } from '@/components/ui/skeleton';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { openUserProfile } from '@/lib/openUserProfile';
import {
  PROFILE_VIEWS_LOCKED_ROWS,
  PROFILE_VIEWS_TITLE,
  fetchProfileViews,
  profileViewsSummary,
  type ProfileViewsResult,
} from '@/services/profileViews';

export default function ProfileViewsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [data, setData] = useState<ProfileViewsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const next = await fetchProfileViews();
    if (next) {
      setData(next);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!loading) {
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [fade, loading]);

  const header = data ? (
    <Stack gap="xs" style={[styles.summary, { paddingHorizontal: gutter }]}>
      <AppText variant="display" color="textPrimary" style={styles.total}>
        {data.total.toLocaleString('en-US')}
      </AppText>
      <AppText variant="body" color="textSecondary">
        {profileViewsSummary(data.total, data.windowDays)}
      </AppText>
    </Stack>
  ) : null;

  const renderLocked = (result: ProfileViewsResult) => {
    const rows = Math.min(PROFILE_VIEWS_LOCKED_ROWS, Math.max(result.total, 3));
    return (
      <Animated.View style={{ opacity: fade }}>
        {header}
        <View style={styles.lockedList} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: rows }, (_, i) => (
            <View key={i}>
              <Row gap="md" align="center" style={[styles.placeholderRow, { paddingHorizontal: gutter }]}>
                <View style={styles.placeholderAvatar} />
                <Stack gap="xs" style={styles.placeholderText}>
                  <View style={[styles.placeholderBar, { width: `${58 - (i % 3) * 12}%` }]} />
                  <View style={[styles.placeholderBar, styles.placeholderBarShort]} />
                </Stack>
                <AppIcon name="lock-closed-outline" size={16} color={colors.textMuted} />
              </Row>
              {i < rows - 1 ? <SarhDivider /> : null}
            </View>
          ))}
        </View>
        <Stack gap="md" align="center" style={[styles.cta, { marginHorizontal: gutter }]}>
          <AppText variant="sectionTitle" color="textPrimary" align="center">
            اعرف من شاهد ملفك
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            متاحة لمشتركي Blue وBlue+ وGold — تظهر الأسماء ووقت الزيارة لآخر 30 يوماً.
          </AppText>
          <SarhButton
            title="عرض الاشتراكات"
            variant="primary"
            onPress={() => router.push('/verification' as never)}
            testID="profile-views-subscribe"
          />
        </Stack>
      </Animated.View>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={PROFILE_VIEWS_TITLE} showBack />
      <ScreenBody scroll={false} gutter={false} padTop="md">
        {loading && !data ? (
          <SkeletonRegion>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i}>
                <UserIdentityRowSkeleton style={{ ...styles.userRow, paddingHorizontal: gutter }} />
                {i < 5 ? <SarhDivider /> : null}
              </View>
            ))}
          </SkeletonRegion>
        ) : !data ? (
          <Stack gap="md" align="center" fill style={styles.empty}>
            <AppText variant="body" color="textMuted" align="center">
              {failed ? 'تعذّر تحميل الزيارات، حاول مرة أخرى' : ''}
            </AppText>
            <SarhButton title="إعادة المحاولة" variant="secondary" size="sm" onPress={() => void load()} />
          </Stack>
        ) : data.locked ? (
          renderLocked(data)
        ) : (
          <Animated.View style={[styles.fill, { opacity: fade }]}>
            <FlatList
              data={data.viewers}
              keyExtractor={(item) => item.user.id}
              ListHeaderComponent={header}
              contentContainerStyle={data.viewers.length === 0 ? styles.emptyList : styles.list}
              ItemSeparatorComponent={SarhDivider}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.userRow, { paddingHorizontal: gutter }, pressed ? styles.pressed : null]}
                  onPress={() => openUserProfile(router, item.user.id)}
                >
                  <UserIdentityRow
                    avatarUri={item.user.avatar}
                    displayName={item.user.arabicName || item.user.displayName || item.user.username}
                    username={item.user.username}
                    verified={item.user.verified}
                    verifiedTier={item.user.verifiedTier}
                    avatarSize={USER_IDENTITY.listAvatarSize}
                    avatarRadius={USER_IDENTITY.listAvatarRadius}
                    avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
                    avatarSide="end"
                    colors={colors}
                    style={styles.identity}
                    trailing={
                      <AppText variant="caption" color="textMuted">
                        {formatRelativeTimeAr(item.viewedAt)}
                      </AppText>
                    }
                  />
                </Pressable>
              )}
              ListEmptyComponent={
                <Stack gap="md" align="center" style={styles.empty}>
                  <AppIcon name="eye-outline" size={28} color={colors.textMuted} />
                  <AppText variant="body" color="textMuted" align="center">
                    لا توجد زيارات خلال آخر 30 يوماً
                  </AppText>
                </Stack>
              }
            />
          </Animated.View>
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    summary: { paddingBottom: spacing.lg },
    total: { fontWeight: '700' },
    list: { paddingBottom: spacing.xl },
    emptyList: { flexGrow: 1 },
    userRow: { paddingVertical: spacing.md },
    pressed: { opacity: 0.6 },
    identity: { width: '100%' },
    empty: { justifyContent: 'center', padding: spacing.xxxl },
    lockedList: { opacity: 0.55 },
    placeholderRow: { paddingVertical: spacing.md },
    placeholderAvatar: {
      width: USER_IDENTITY.listAvatarSize,
      height: USER_IDENTITY.listAvatarSize,
      borderRadius: USER_IDENTITY.listAvatarSize / 2,
      backgroundColor: colors.bgElevated,
    },
    placeholderText: { flex: 1, minWidth: 0 },
    placeholderBar: {
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.bgElevated,
    },
    placeholderBarShort: { width: '32%' },
    cta: {
      marginTop: spacing.xl,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
    },
  });
}
