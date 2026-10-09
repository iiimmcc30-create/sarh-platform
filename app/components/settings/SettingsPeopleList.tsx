import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { SkeletonRegion, UserIdentityRowSkeleton } from '@/components/ui/skeleton';
import { AppText } from '@/design-system/components';
import { motion } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { SettingsGroup, SettingsStatus } from './SettingsRows';

export type SettingsPerson = {
  id: string;
  avatar?: string | null;
  arabicName?: string | null;
  displayName: string;
  username?: string | null;
  verified?: boolean;
  verifiedTier?: string | null;
};

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  identity: { flex: 1, minWidth: 0 },
  pill: {
    minWidth: 88,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

/**
 * Blocked / muted accounts as one inset-grouped list: identity rows with a
 * small outlined pill on the end (iOS «Unblock»), skeleton rows on first load.
 */
export function SettingsPeopleList({
  users,
  loading,
  actionId,
  actionLabel,
  onAction,
  title,
  footer,
  emptyIcon,
  emptyText,
}: {
  users: SettingsPerson[];
  loading: boolean;
  actionId: string | null;
  actionLabel: string;
  onAction: (id: string) => void;
  title?: string;
  footer?: string;
  emptyIcon: string;
  emptyText: string;
}) {
  const { colors } = useTheme();

  if (loading && users.length === 0) {
    return (
      <SettingsGroup footer={footer}>
        <SkeletonRegion>
          {[0, 1, 2, 3].map((i) => (
            <View key={i}>
              <UserIdentityRowSkeleton trailingPill={88} trailingPillHeight={32} style={styles.row} />
            </View>
          ))}
        </SkeletonRegion>
      </SettingsGroup>
    );
  }

  if (users.length === 0) {
    return (
      <>
        <SettingsStatus state="empty" icon={emptyIcon} message={emptyText} />
        {footer ? <SettingsGroupFooterOnly text={footer} /> : null}
      </>
    );
  }

  return (
    <SettingsGroup title={title} footer={footer}>
      {users.map((user, idx) => {
        const busy = actionId === user.id;
        return (
          <View key={user.id}>
            <View style={[styles.row, getRtlRow()]}>
              <UserIdentityRow
                avatarUri={user.avatar}
                displayName={user.arabicName || user.displayName}
                username={user.username ?? undefined}
                verified={user.verified}
                verifiedTier={user.verifiedTier ?? undefined}
                avatarSize={USER_IDENTITY.listAvatarSize}
                avatarRadius={USER_IDENTITY.listAvatarRadius}
                avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
                colors={colors}
                nameLines={2}
                style={styles.identity}
              />
              <Pressable
                onPress={() => onAction(user.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                accessibilityState={{ busy }}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.pill,
                  { borderColor: colors.borderMid, opacity: pressed ? motion.press.opacity : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <AppText variant="caption" color="textPrimary" align="center">
                    {actionLabel}
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </SettingsGroup>
  );
}

function SettingsGroupFooterOnly({ text }: { text: string }) {
  return (
    <AppText variant="caption" color="textMuted" style={{ paddingHorizontal: 32, paddingTop: 8 }}>
      {text}
    </AppText>
  );
}
