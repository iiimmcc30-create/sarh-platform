/**
 * Sarh Design System — SidebarMenuItem
 *
 * Target visual (Arabic UI):
 *   RIGHT                                         LEFT
 *   [ Icon ] [ Title ] ————————————— [ > ]
 *
 * Outline variant (More tab): cover-style trailing cluster — icon on physical
 * right, title in rtlTextShell hugging the icon (same pattern as listing cover).
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { isNavigationLocked } from '@/lib/safeNavigate';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';

export type SidebarMenuItemProps = {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  badge?: number;
  active?: boolean;
  showDivider?: boolean;
  showChevron?: boolean;
  iconColor?: string;
  /** More-tab reference: white outline icons, cover alignment, inset dividers. */
  variant?: 'default' | 'outline';
  colors?: ThemeColors;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
};

export const SIDEBAR_MENU_ITEM = {
  minHeight: 56,
  outlineMinHeight: 52,
  paddingHorizontal: spacing.md,
  outlinePaddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  outlinePaddingVertical: 14,
  gap: spacing.md,
  iconSize: 20,
  outlineIconSize: 22,
  iconWrap: 40,
  iconRadius: radius.md,
  titleSize: 15,
  titleWeight: '600' as const,
  subtitleSize: 12,
  chevronSize: 14,
} as const;

function OutlineMenuItem({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  active = false,
  showDivider,
  showChevron,
  iconColor,
  colors,
  tint,
  chevronColor,
  style,
  accessibilityLabel,
  testID,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  badge?: number;
  active?: boolean;
  showDivider: boolean;
  showChevron: boolean;
  iconColor?: string;
  colors: ThemeColors;
  tint: string;
  chevronColor: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const showBadge = typeof badge === 'number' && badge > 0;
  const iconTint = iconColor ?? (active ? colors.electric : tint);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (isNavigationLocked()) return;
        onPress();
      }}
      style={({ pressed }) => [
        styles.outlineWrap,
        active && { backgroundColor: `${colors.electric}10` },
        pressed && styles.rowPressed,
        style,
      ]}
    >
      <View style={[styles.outlineRow, getRtlRow()]}>
        <View style={styles.iconWrapOutline}>
          <AppIcon
            name={icon}
            size={SIDEBAR_MENU_ITEM.outlineIconSize}
            color={iconTint}
          />
        </View>
        <View style={[{ flex: 1, minWidth: 0 }, styles.textShellGap]}>
          <AppText style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {showBadge ? (
          <View style={[styles.badge, { backgroundColor: colors.electric }]}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
        <View style={styles.chevronSlot}>
          {showChevron ? (
            <AppIcon
              name={rtlForwardIcon()}
              size={SIDEBAR_MENU_ITEM.chevronSize}
              color={chevronColor}
            />
          ) : null}
        </View>
      </View>

      {showDivider ? (
        <View style={[styles.dividerInset, { backgroundColor: colors.borderSoft }]} />
      ) : null}
    </Pressable>
  );
}

export function SidebarMenuItem({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  active = false,
  showDivider = true,
  showChevron = true,
  iconColor,
  variant = 'outline',
  colors: colorsProp,
  style,
  accessibilityLabel,
  testID,
}: SidebarMenuItemProps) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;
  const isOutline = variant === 'outline';
  const tint =
    iconColor ??
    (isOutline
      ? active
        ? colors.electric
        : colors.textPrimary
      : active
        ? colors.electric
        : colors.textMuted);
  const chevronColor = isOutline ? colors.textMuted : colors.textSubtle;
  const showBadge = typeof badge === 'number' && badge > 0;

  if (isOutline) {
    return (
      <OutlineMenuItem
        icon={icon}
        title={title}
        subtitle={subtitle}
        onPress={onPress}
        badge={badge}
        active={active}
        showDivider={showDivider}
        showChevron={showChevron}
        iconColor={iconColor}
        colors={colors}
        tint={tint}
        chevronColor={chevronColor}
        style={style}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (isNavigationLocked()) return;
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        getRtlRow(),
        { borderBottomColor: colors.borderHairline },
        showDivider && styles.rowDivider,
        active && { backgroundColor: `${colors.electric}14` },
        pressed && styles.rowPressed,
        style,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tint}18` }]}>
        <AppIcon name={icon} size={SIDEBAR_MENU_ITEM.iconSize} color={tint} />
      </View>

      <View style={[{ flex: 1, minWidth: 0 }, styles.textShellGap]}>
        <AppText style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: colors.electric }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}

      {showChevron ? (
        <AppIcon
          name={rtlForwardIcon()}
          size={SIDEBAR_MENU_ITEM.chevronSize}
          color={chevronColor}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: SIDEBAR_MENU_ITEM.gap,
    paddingHorizontal: SIDEBAR_MENU_ITEM.paddingHorizontal,
    paddingVertical: SIDEBAR_MENU_ITEM.paddingVertical,
    minHeight: SIDEBAR_MENU_ITEM.minHeight,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  outlineWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  outlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIDEBAR_MENU_ITEM.gap,
    paddingHorizontal: SIDEBAR_MENU_ITEM.outlinePaddingHorizontal,
    paddingVertical: SIDEBAR_MENU_ITEM.outlinePaddingVertical,
    minHeight: SIDEBAR_MENU_ITEM.outlineMinHeight,
    minWidth: 0,
  },
  textShellGap: {
    gap: 2,
  },
  chevronSlot: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dividerInset: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SIDEBAR_MENU_ITEM.outlinePaddingHorizontal,
  },
  rowPressed: {
    opacity: 0.76,
  },
  iconWrap: {
    width: SIDEBAR_MENU_ITEM.iconWrap,
    height: SIDEBAR_MENU_ITEM.iconWrap,
    borderRadius: SIDEBAR_MENU_ITEM.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapOutline: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    ...typography.cardHeading,
  },
  subtitle: {
    ...typography.caption,
  },
  badge: {
    minWidth: 24,
    minHeight: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    flexShrink: 0,
  },
  badgeText: {
    ...typography.badge,
    color: '#F4F7F9',
  },
});

export default SidebarMenuItem;
