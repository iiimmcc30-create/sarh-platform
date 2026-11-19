import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SarhAvatar } from '@/design-system/components/SarhAvatar';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { INBOX_ICON, type NotificationGroup } from '@/lib/notificationInbox';
import { getRtlRow, positionInlineEnd } from '@/lib/rtl';

type Props = {
  group: NotificationGroup;
  onPress: () => void;
};

export function NotificationGroupRow({ group, onPress }: Props) {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
  }));
  const icon = INBOX_ICON[group.kind];
  const shown = group.actors.slice(0, 3);
  const time = formatRelativeTimeAr(group.createdAt);
  const label = group.parts.map((part) => part.text).join('');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`notif-row-${group.kind}`}
      style={({ pressed }) => [
        styles.row,
        !group.isRead && styles.unread,
        pressed && styles.pressed,
      ]}
    >
      <Row align="start" gap="md">
        <View style={[styles.avatarSlot, getRtlRow()]}>
          {shown.length === 0 ? (
            <View style={[styles.fallback, { backgroundColor: icon.color }]}>
              <AppIcon name={icon.name} size={18} color={colors.onElectric} variant="br" />
            </View>
          ) : (
            shown.map((actor, index) => (
              <View
                key={actor.id ?? `${actor.name}-${index}`}
                style={[styles.avatar, index > 0 && styles.avatarOverlap]}
              >
                <SarhAvatar uri={actor.avatar} name={actor.name || '؟'} size="md" />
              </View>
            ))
          )}
          {shown.length > 0 ? (
            <View style={[styles.badge, { backgroundColor: icon.color }]}>
              <AppIcon name={icon.name} size={12} color="#FFFFFF" variant="br" />
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <AppText variant="body" color="textPrimary">
            {group.parts.map((part, index) => (
              <AppText
                key={`${index}-${part.text}`}
                variant={part.strong ? 'label' : 'body'}
                color="textPrimary"
              >
                {part.text}
              </AppText>
            ))}
          </AppText>
          {time ? (
            <AppText variant="caption" color="textMuted">
              {time}
            </AppText>
          ) : null}
          {group.actionLabel ? (
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={group.actionLabel}
              testID="notif-join"
              style={styles.action}
            >
              <AppText variant="label" color="textPrimary">
                {group.actionLabel}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </Row>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    row: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
      backgroundColor: colors.bgSurface,
    },
    unread: {
      backgroundColor: scheme === 'light' ? 'rgba(29, 155, 240, 0.08)' : 'rgba(29, 155, 240, 0.16)',
    },
    pressed: { opacity: 0.85 },
    avatarSlot: {
      width: 52,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      borderWidth: 2,
      borderColor: colors.bgSurface,
      borderRadius: 999,
    },
    avatarOverlap: {
      marginStart: -16,
    },
    fallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      bottom: 0,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bgSurface,
      ...positionInlineEnd(-2),
    },
    body: {
      flex: 1,
      gap: spacing.xs,
      minWidth: 0,
    },
    action: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      backgroundColor: colors.bgElevated,
    },
  });
}
