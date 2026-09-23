import type { ReactNode } from 'react';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppText } from '@/components/ui/AppText';
import { getRtlRow } from '@/lib/rtl';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { sarh } from '@/constants/sarhTokens';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export const USER_IDENTITY = {
  sidebarAvatarSize: 58,
  sidebarAvatarRadius: 16,
  sidebarAvatarBorder: 2,
  listAvatarSize: 44,
  listAvatarRadius: 16,
  listAvatarBorder: 2,
} as const;

export type UserIdentityRowProps = {
  avatarUri?: string | null;
  displayName: string;
  username?: string;
  verified?: boolean;
  /** Defaults to sidebar green action border when set; pass 0 for flat lists. */
  avatarSize?: number;
  avatarRadius?: number;
  avatarBorderWidth?: number;
  avatarBorderColor?: string;
  nameLines?: number;
  /** Renders under username (e.g. section badge pill). */
  footer?: ReactNode;
  /** Action slot (follow button, unblock, counts, …). */
  trailing?: ReactNode;
  /**
   * `start` — avatar on physical left (lists).
   * `end` — cover style: avatar on physical right like sidebar menu icons.
   */
  avatarSide?: 'start' | 'end';
  onPress?: () => void;
  colors?: ThemeColors;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  nameStyle?: TextStyle;
  usernameStyle?: TextStyle;
};

/**
 * Canonical avatar + name row — same LTR shell alignment as sidebar profile rows.
 * Prevents Arabic display names from clipping under app RTL.
 */
export function UserIdentityRow({
  avatarUri,
  displayName,
  username,
  verified = false,
  avatarSize = USER_IDENTITY.sidebarAvatarSize,
  avatarRadius = USER_IDENTITY.sidebarAvatarRadius,
  avatarBorderWidth = USER_IDENTITY.sidebarAvatarBorder,
  avatarBorderColor,
  nameLines = 2,
  footer,
  trailing,
  avatarSide: _avatarSide = 'start',
  onPress,
  colors: colorsProp,
  style,
  contentStyle,
  nameStyle,
  usernameStyle,
}: UserIdentityRowProps) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const handle = username
    ? username.startsWith('@')
      ? username
      : `@${username}`
    : null;

  const borderColor =
    avatarBorderColor ??
    (avatarBorderWidth > 0 ? sarh.color.action : colors.borderMid);

  const avatar = (
    <Image
      source={uriSource(avatarUri)}
      style={[
        styles.avatar,
        {
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarRadius,
          borderWidth: avatarBorderWidth,
          borderColor,
        },
      ]}
      contentFit="cover"
    />
  );

  const textBlock = (
    <View style={[styles.profileText, contentStyle]}>
      <View style={[styles.nameRow, getRtlRow()]}>
        <AppText
          style={[styles.displayName, nameStyle]}
          numberOfLines={nameLines}
        >
          {displayName}
        </AppText>
        {verified ? <VerificationBadge size={14} /> : null}
      </View>
      {handle ? (
        <AppText style={[styles.usernameText, usernameStyle]} numberOfLines={1}>
          {handle}
        </AppText>
      ) : null}
      {footer}
    </View>
  );

  const trailingSlot = trailing ? (
    <View style={styles.trailing}>{trailing}</View>
  ) : null;

  const content = (
    <>
      {avatar}
      {textBlock}
      {trailingSlot}
    </>
  );

  const rowStyle = [styles.row, getRtlRow(), style];

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        <View style={rowStyle}>{content}</View>
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      gap: spacing.md,
    },
    avatar: {
      backgroundColor: colors.bgElevated,
      flexShrink: 0,
    },
    profileText: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    nameRow: {
      width: '100%',
    },
    displayName: {
      ...typography.cardHeading,
      color: colors.textPrimary,
    },
    usernameText: {
      ...typography.caption,
      color: colors.textMuted,
    },
    trailing: {
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export default UserIdentityRow;
