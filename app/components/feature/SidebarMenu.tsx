import type { ReactNode } from 'react';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { CoverTrailRow } from '@/components/ui/CoverTrailRow';
import {
  SidebarMenuItem as SidebarMenuItemRow,
  type SidebarMenuItemProps,
} from '@/components/ui/SidebarMenuItem';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import { isAppRtl } from '@/lib/rtl';
import { motion } from '@/design-system';
import { AppText } from '@/components/ui/AppText';

/** Shared elevated surface — More tab / reference contrast style. */
export const MENU_CARD = {
  radius: 14,
  controlRadius: 14,
  sectionTitlePad: spacing.lg,
} as const;

/** Elevated card surface: no border, high contrast on screenRoot. */
export function menuCardStyle(colors: ThemeColors): ViewStyle {
  return {
    backgroundColor: colors.bgElevated,
    borderRadius: MENU_CARD.radius,
    overflow: 'hidden',
  };
}

/** Elevated control (search bars, icon buttons) — same contrast, no border. */
export function elevatedControlStyle(colors: ThemeColors): ViewStyle {
  return {
    backgroundColor: colors.bgElevated,
    borderRadius: MENU_CARD.controlRadius,
    borderWidth: 0,
  };
}

/**
 * Data shape for building sidebar/settings menus.
 * Prefer `title`; `label` is kept for existing call sites.
 */
export type SidebarNavItem = {
  key: string;
  icon: string;
  title?: string;
  label?: string;
  subtitle?: string;
  route?: string;
  onPress?: () => void;
  badge?: number;
  accent?: string;
};

export function SidebarSection({
  title,
  children,
  colors,
  variant = 'card',
}: {
  title?: string;
  children: ReactNode;
  colors: ThemeColors;
  variant?: 'card' | 'flat';
}) {
  return (
    <View style={sectionStyles.block}>
      {title ? (
        <View style={[{ width: '100%' }, sectionStyles.titleShell]}>
          <AppText style={[sectionStyles.title, { color: colors.textPrimary }]}>{title}</AppText>
        </View>
      ) : null}
      <View style={[sectionStyles.card, variant === 'card' ? menuCardStyle(colors) : null]}>
        {children}
      </View>
    </View>
  );
}

/**
 * Adapter over the canonical SidebarMenuItem design-system row.
 * Accepts the existing data object API used by sidebars/settings.
 */
export function SidebarMenuRow({
  item,
  colors,
  onPress,
  iconColor,
  isLast = false,
  active = false,
  showChevron = true,
}: {
  item: SidebarNavItem;
  colors: ThemeColors;
  onPress: () => void;
  iconColor?: string;
  isLast?: boolean;
  active?: boolean;
  showChevron?: boolean;
}) {
  const title = item.title ?? item.label ?? '';

  return (
    <SidebarMenuItemRow
      icon={item.icon}
      title={title}
      subtitle={item.subtitle}
      onPress={onPress}
      badge={item.badge}
      active={active}
      showDivider={!isLast}
      showChevron={showChevron}
      iconColor={iconColor ?? item.accent}
      colors={colors}
      variant="outline"
    />
  );
}

/** Canonical design-system row — preferred for new code. */
export { SidebarMenuItemRow as SidebarMenuItem };
export type { SidebarMenuItemProps };

/** iOS-style brand toggle — green track when on, white thumb. */
export function BrandSwitch({
  value,
  onValueChange,
  colors,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  colors: ThemeColors;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.bgDeep, true: colors.success }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.bgDeep}
    />
  );
}

export function SidebarThemeToggle({
  preference,
  colors,
  onToggle,
  variant = 'outline',
  title = 'المظهر',
  headerIcon,
  themeLabel = 'المظهر',
  footer,
}: {
  preference: 'light' | 'dark' | 'system';
  colors: ThemeColors;
  onToggle: () => void;
  variant?: 'default' | 'outline';
  /** Card heading — e.g. الخدمات when theme + services share one card. */
  title?: string;
  headerIcon?: string;
  /** Small label above the light/dark track. Hidden when equal to `title`. */
  themeLabel?: string | null;
  footer?: ReactNode;
}) {
  const isDark = preference !== 'light';
  const isRtl = isAppRtl();
  const isOutline = variant === 'outline';
  const iconTint = isOutline ? colors.textPrimary : colors.textMuted;
  const resolvedHeaderIcon =
    headerIcon ?? (isDark ? 'weather-night' : 'sunny-outline');
  const showThemeLabel = Boolean(themeLabel && themeLabel !== title);

  return (
    <View
      style={[
        themeStyles.wrap,
        isOutline && themeStyles.wrapOutline,
        isOutline ? menuCardStyle(colors) : null,
        {
          direction: isRtl ? 'rtl' : 'ltr',
          backgroundColor: isOutline ? undefined : colors.bgSurface,
          borderColor: isOutline ? 'transparent' : colors.borderSoft,
        },
      ]}
    >
      <View style={[themeStyles.header, themeStyles.headerCover]}>
        <CoverTrailRow justify="flex-end" gap={10} style={themeStyles.coverTrail}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText style={[themeStyles.title, { color: colors.textPrimary }]}>{title}</AppText>
          </View>
          <AppIcon name={resolvedHeaderIcon} size={22} color={iconTint} />
        </CoverTrailRow>
      </View>
      {showThemeLabel ? (
        <View style={[{ width: '100%' }, themeStyles.subLabelShell]}>
          <AppText style={[themeStyles.subLabel, { color: colors.textMuted }]}>{themeLabel}</AppText>
        </View>
      ) : null}
      <View
        style={[
          themeStyles.track,
          {
            flexDirection: 'row',
            direction: isRtl ? 'rtl' : 'ltr',
            backgroundColor: colors.bgDeep,
            borderColor: colors.borderHairline,
          },
        ]}
      >
        <Pressable
          onPress={() => isDark && onToggle()}
          style={[
            themeStyles.option,
            { flexDirection: 'row' },
            !isDark && { backgroundColor: colors.electric, shadowColor: colors.electric },
          ]}
        >
          <AppIcon name="sunny-outline" size={16} color={!isDark ? '#fff' : colors.textMuted} />
          <Text style={[themeStyles.optionText, { color: !isDark ? '#fff' : colors.textMuted }]}>
            فاتح
          </Text>
        </Pressable>
        <Pressable
          onPress={() => !isDark && onToggle()}
          style={[
            themeStyles.option,
            { flexDirection: 'row' },
            isDark && { backgroundColor: colors.electric, shadowColor: colors.electric },
          ]}
        >
          <AppIcon name="weather-night" size={16} color={isDark ? '#fff' : colors.textMuted} />
          <Text style={[themeStyles.optionText, { color: isDark ? '#fff' : colors.textMuted }]}>
            داكن
          </Text>
        </Pressable>
      </View>
      {footer ? (
        <View
          style={[
            themeStyles.footer,
            { borderTopColor: colors.borderHairline ?? colors.borderSoft },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function SidebarLogoutButton({
  colors,
  onPress,
  variant = 'card',
}: {
  colors: ThemeColors;
  onPress: () => void;
  variant?: 'card' | 'flat';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="تسجيل الخروج"
      onPress={onPress}
      style={({ pressed }) => [
        logoutStyles.btn,
        variant === 'card' ? menuCardStyle(colors) : null,
        pressed && { opacity: motion.press.opacity, transform: [{ scale: motion.press.scale }] },
      ]}
    >
      <View style={logoutStyles.chevronSlot} />
      <CoverTrailRow flex justify="flex-end" gap={10}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={[logoutStyles.text, { color: colors.rose }]}>تسجيل الخروج</AppText>
        </View>
        <View style={logoutStyles.iconWrapOutline}>
          <AppIcon name="log-out-outline" size={22} color={colors.rose} />
        </View>
      </CoverTrailRow>
    </Pressable>
  );
}

const sectionStyles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  titleShell: {
    marginBottom: spacing.sm,
    paddingHorizontal: MENU_CARD.sectionTitlePad,
  },
  title: {
    ...typography.smallHeading,
  },
  card: {},
});

const themeStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  wrapOutline: {
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 4,
  },
  headerCover: {
    paddingHorizontal: spacing.lg - 4,
  },
  coverTrail: {
    width: '100%',
  },
  title: {
    ...typography.smallHeading,
  },
  subLabelShell: {
    paddingHorizontal: 4,
  },
  subLabel: {
    ...typography.badge,
  },
  track: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  footer: {
    marginHorizontal: -spacing.lg,
    marginBottom: -spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  optionText: {
    ...typography.badge,
  },
});

const logoutStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
        alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 52,
  },
  chevronSlot: {
    width: 18,
    flexShrink: 0,
  },
  iconWrapOutline: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    ...typography.button,
  },
});
