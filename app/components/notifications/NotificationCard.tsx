import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ambientShadow, ds } from '@/constants/designSystem';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatApplicationDateTime } from '@/lib/formatDateTime';
import { getRtlRow, marginEnd, rtlForwardIcon } from '@/lib/rtl';
import type { AppNotification } from '@/services/notifications';

type NotificationCardProps = {
  notification: AppNotification;
  onPress: () => void;
};

export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
  }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !notification.isRead && styles.unreadCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={getRtlRow()}>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, !notification.isRead && styles.unreadTitle]} numberOfLines={2}>
              {notification.titleAr}
            </Text>
            {!notification.isRead ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.body} numberOfLines={3}>
            {notification.bodyAr}
          </Text>
          <Text style={styles.time}>{formatApplicationDateTime(notification.createdAt)}</Text>
        </View>
        <AppIcon name={rtlForwardIcon()} size={ds.icon.sm} color={colors.textMuted} style={styles.chevron} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const tokens = scheme === 'light' ? ds.light : ds.dark;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bgSurface,
      borderRadius: ds.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.stroke,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...ambientShadow(scheme, 'soft'),
    },
    unreadCard: {
      borderColor: colors.borderMid,
      backgroundColor: colors.bgElevated,
    },
    pressed: {
      opacity: 0.9,
    },
    content: {
      flex: 1,
      gap: spacing.sm,
    },
    titleRow: {
      ...getRtlRow(),
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    title: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    unreadTitle: {
      color: colors.textPrimary,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.glow,
      marginTop: 6,
    },
    body: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    time: {
      ...typography.caption,
      color: colors.textMuted,
    },
    chevron: {
      marginTop: spacing.xs,
      ...marginEnd(spacing.xs),
    },
  });
}
