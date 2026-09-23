// Header bell icon with unread badge — navigates to notification center

import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { inlineStart } from '@/lib/rtl';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount';

type NotificationBellButtonProps = {
  size?: number;
  iconSize?: number;
  style?: object;
  iconColor?: string;
  badgeBorderColor?: string;
  /** Flat icon only — no elevated background (home header). */
  bare?: boolean;
};

export function NotificationBellButton({
  size = 48,
  iconSize = 20,
  style,
  iconColor,
  badgeBorderColor,
  bare = false,
}: NotificationBellButtonProps) {
  const router = useRouter();
  const { unreadCount } = useUnreadNotificationCount();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));

  return (
    <Pressable
      style={[
        styles.iconBtn,
        bare && styles.iconBtnBare,
        { width: size, height: size },
        style,
      ]}
      hitSlop={8}
      onPress={() => router.push('/notifications')}
      accessibilityLabel="الإشعارات"
      accessibilityRole="button"
    >
      <AppIcon name="bell" size={iconSize} color={iconColor ?? colors.textPrimary} />
      {unreadCount > 0 ? (
        <View style={[styles.badge, badgeBorderColor ? { borderColor: badgeBorderColor } : null]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '٩٩+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    iconBtn: {
      borderRadius: 0,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
    },
    iconBtnBare: {
      borderRadius: 0,
      backgroundColor: 'transparent',
    },
    badge: {
      position: 'absolute',
      top: -2,
      ...inlineStart(-2),
      minWidth: 20,
      minHeight: 20,
      paddingHorizontal: spacing.xs,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bgDeep,
    },
    badgeText: {
      ...typography.badge,
      color: '#fff',
    },
  });
}
