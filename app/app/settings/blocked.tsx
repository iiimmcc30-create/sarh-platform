import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { confirmDestructive, alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { fetchBlockedUsers, setBlockUser, type BlockedUser } from '@/services/users';
import { motion } from '@/design-system';
import { AppText, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

export default function BlockedUsersScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchBlockedUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUnblock = async (user: BlockedUser) => {
    const confirmed = await confirmDestructive(
      'إلغاء الحظر',
      `هل تريد إلغاء حظر ${user.arabicName || user.displayName}؟`,
      'إلغاء الحظر',
    );
    if (!confirmed) return;

    setActionId(user.id);
    const result = await setBlockUser(user.id, false);
    setActionId(null);
    if (!result.ok) {
      await alertMessage('تعذّر إلغاء الحظر', result.message, 'close-circle-outline');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    void showToast('تم إلغاء الحظر', 'success');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="المحظورين" showBack />
      <ScreenBody padTop="lg" gap="lg" padBottom="xxxl">
        <AppText variant="caption" color="textMuted" style={styles.description}>
          الحسابات المحظورة لن تظهر منشوراتها وإعلاناتها في خلاصتك، ولا يمكنها التواصل معك.
        </AppText>

        {loading && users.length === 0 ? (
          <ActivityIndicator color={colors.electricBright} style={styles.loader} />
        ) : users.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.emptyBox}>
            <AppIcon name="block" size={32} color={colors.textMuted} />
            <AppText variant="body" color="textMuted">
              لا يوجد حسابات محظورة
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
                    onPress={() => void handleUnblock(user)}
                    disabled={actionId === user.id}
                    accessibilityRole="button"
                    accessibilityLabel="إلغاء الحظر"
                  >
                    {actionId === user.id ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <AppText variant="caption" color="textPrimary" align="center">
                        إلغاء الحظر
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
    loader: { marginTop: spacing.xl },
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
