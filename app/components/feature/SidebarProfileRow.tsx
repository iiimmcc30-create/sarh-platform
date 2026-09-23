import type { ReactNode } from 'react';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { MENU_CARD, menuCardStyle } from '@/components/feature/SidebarMenu';
import { SIDEBAR_MENU_ITEM } from '@/components/ui/SidebarMenuItem';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

export const SIDEBAR_PROFILE = {
  avatarSize: USER_IDENTITY.sidebarAvatarSize,
  avatarRadius: USER_IDENTITY.sidebarAvatarRadius,
  avatarBorder: USER_IDENTITY.sidebarAvatarBorder,
  nameLines: 2,
} as const;

export type SidebarProfileRowProps = {
  avatarUri?: string | null;
  displayName: string;
  username?: string;
  onPress?: () => void;
  /** Small pill under the username (e.g. «قسم الملاحم»). */
  badgeLabel?: string;
  badge?: ReactNode;
  /** @deprecated Card surface replaces the old hairline divider. */
  showDivider?: boolean;
  colors?: ThemeColors;
  style?: ViewStyle;
};

/**
 * Sidebar profile header — avatar + name inside the same elevated card
 * surface used by SidebarSection / category menu cards.
 */
export function SidebarProfileRow({
  avatarUri,
  displayName,
  username,
  onPress,
  badgeLabel,
  badge,
  colors: colorsProp,
  style,
}: SidebarProfileRowProps) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const footer = (
    <>
      {badgeLabel ? (
        <View style={styles.badgePill}>
          <Text style={styles.badgePillText}>{badgeLabel}</Text>
        </View>
      ) : null}
      {badge}
    </>
  );

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.card, menuCardStyle(colors)]}>
        <UserIdentityRow
          avatarUri={avatarUri}
          displayName={displayName}
          username={username}
          onPress={onPress}
          colors={colors}
          avatarSide="end"
          avatarSize={SIDEBAR_PROFILE.avatarSize}
          avatarRadius={SIDEBAR_PROFILE.avatarRadius}
          avatarBorderWidth={SIDEBAR_PROFILE.avatarBorder}
          avatarBorderColor={colors.electric}
          nameLines={SIDEBAR_PROFILE.nameLines}
          nameStyle={styles.displayName}
          footer={badgeLabel || badge ? footer : undefined}
          style={styles.row}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /** Match SidebarSection horizontal inset. */
    wrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    card: {
      borderRadius: MENU_CARD.radius,
    },
    row: {
      /** Match OutlineMenuItem padding so avatar lines up with menu icons. */
      paddingHorizontal: SIDEBAR_MENU_ITEM.outlinePaddingHorizontal,
      paddingVertical: SIDEBAR_MENU_ITEM.outlinePaddingVertical + 4,
    },
    displayName: {
      ...typography.cardHeadingLarge,
    },
    badgePill: {
      marginTop: 4,
      alignSelf: 'flex-end',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: `${colors.electric}22`,
    },
    badgePillText: {
      ...typography.badge,
      color: colors.electric,
      writingDirection: 'rtl',
    },
  });
}

export default SidebarProfileRow;
