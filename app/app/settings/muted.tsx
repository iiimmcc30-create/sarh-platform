import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { fetchMutedUsers, setMuteUser, type MutedUser } from '@/services/userSettings';
import { motion } from '@/design-system';
import { AppText, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SkeletonRegion, UserIdentityRowSkeleton } from '@/components/ui/skeleton';

export default function MutedUsersScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [users, setUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchMutedUsers();
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUnmute = async (user: MutedUser) => {
    setActionId(user.id);
    const result = await setMuteUser(user.id, false);
    setActionId(null);
    if (!result.ok) {
      await alertMessage('تعذّر إلغاء الكتم', result.message ?? 'حاول مجدداً');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    void showToast('تم إلغاء الكتم', 'success');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الحسابات المكتومة" showBack />
      <ScreenBody padTop="lg" gap="lg" padBottom="xxxl">
        <AppText variant="caption" color="textMuted" style={styles.description}>
          لن تظهر منشورات وقصص الحسابات المكتومة في خلاصتك. الكتم صامت: لا يعرف الحساب أنك كتمته، ويبقى بإمكانه مراسلتك.
        </AppText>

        {loading && users.length === 0 ? (
          // First load: identity rows with the unmute pill (96 × caption + 2×8).
          <SkeletonRegion>
            {[0, 1, 2, 3].map((i) => (
              <Stack key={i} gap="none">
                <UserIdentityRowSkeleton trailingPill={96} trailingPillHeight={34} style={styles.row} />
                {i < 3 ? <SarhDivider /> : null}
              </Stack>
            ))}
          </SkeletonRegion>
        ) : users.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.emptyBox}>
            <AppIcon name="volume-mute-outline" size={32} color={colors.textMuted} />
            <AppText variant="body" color="textMuted">
              لا توجد حسابات مكتومة
            </AppText>
          </Stack>
        ) : (
          <Stack gap="none">
            {users.map((user, idx) => (
              <Stack key={user.id} gap="none">
                <Row gap="md" align="center" style={styles.row}>
                  <UserIdentityRow
                    avatarUri={user.avatar}
                    displayName={user.arabicName || user.displayName}
                    username={user.username}
                    verified={user.verified}
                    verifiedTier={user.verifiedTier}
                    avatarSize={USER_IDENTITY.listAvatarSize}
                    avatarRadius={USER_IDENTITY.listAvatarRadius}
                    avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
                    colors={colors}
                    nameLines={2}
                    style={styles.identity}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.unblockBtn,
                      { opacity: pressed ? motion.press.opacity : 1 },
                    ]}
                    onPress={() => void handleUnmute(user)}
                    disabled={actionId === user.id}
                    accessibilityRole="button"
                    accessibilityLabel="إلغاء الكتم"
                  >
                    {actionId === user.id ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <AppText variant="caption" color="textPrimary" align="center">
                        إلغاء الكتم
                      </AppText>
                    )}
                  </Pressable>
                </Row>
                {idx < users.length - 1 ? <SarhDivider /> : null}
              </Stack>
            ))}
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    description: {
      lineHeight: 20,
    },
    emptyBox: {
      paddingVertical: spacing.xxl,
    },
    row: {
      paddingVertical: spacing.md,
    },
    identity: {
      flex: 1,
      minWidth: 0,
    },
    unblockBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      minWidth: 96,
      alignItems: 'center',
      flexShrink: 0,
    },
  });
}
