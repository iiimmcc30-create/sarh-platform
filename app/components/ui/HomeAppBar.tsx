import { NotificationBellButton } from '@/components/notifications/NotificationBellButton';
import { SarhLogoMark } from '@/components/ui/SarhLogoMark';
import { ds } from '@/constants/designSystem';
import { type ThemeColors } from '@/constants/theme';
import { radius, space } from '@/design-system';
import { AVATAR_SIZE, SarhAvatar, SarhSurface } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const HOME_APP_BAR_H = ds.homeAppBar.height;
const BAR_H = space[40];
const TOOL = space[40];
const ICON_SIZE = space[20];
const AVATAR = AVATAR_SIZE.sm;
/** Shared shell identity metrics — Home and Community headers stay aligned. */
export const SHELL_AVATAR_SIZE = AVATAR;
export const SHELL_AVATAR_BTN = space[40];
export const SHELL_TOOL = TOOL;
export const SHELL_ICON_SIZE = ICON_SIZE;
export const SHELL_BAR_H = BAR_H;
export const SHELL_LOGO_SIZE = 28;
/** Identity row only — top safe area is owned here, not by Screen. */
export const HOME_APP_BAR_STACK_H = space[8] + BAR_H + space[8];
/** Identity row + top gap. Collapse this range; tabs stay sticky below the inset. */
export const SHELL_IDENTITY_COLLAPSE_H = space[8] + BAR_H;

/** Full identity chrome height with the single top-inset owner. */
export function shellIdentityStackH(insetTop = 0) {
  return insetTop + HOME_APP_BAR_STACK_H;
}

type HomeAppBarProps = {
  onAvatarPress: () => void;
  displayName: string;
  avatarUri?: string | null;
  /** Replaces the centered logo — used by the Search tab identity row. */
  center?: ReactNode;
  children?: ReactNode;
  /** Scroll-driven translate for identity + tabs. Status inset stays put. */
  collapseStyle?: StyleProp<ViewStyle>;
  /** Scroll-driven opacity for the avatar / center / bell row only. */
  identityStyle?: StyleProp<ViewStyle>;
  /** Replaces the avatar control — Search Mode/Results back button. */
  leading?: ReactNode;
  /** When false, keep the trailing slot width but hide the bell. */
  showNotifications?: boolean;
};

/** Home header: user avatar, centered Sarh mark, notifications. */
export function HomeAppBar({
  onAvatarPress,
  displayName,
  avatarUri,
  center,
  children,
  collapseStyle,
  identityStyle,
  leading,
  showNotifications = true,
}: HomeAppBarProps) {
  const { colors: themeColors, isDark } = useTheme();
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const colorStyles = useThemedStyles(({ colors, scheme }) => createColorStyles(colors, scheme));
  const Inner = collapseStyle ? Animated.View : View;
  const IdentityBox = identityStyle ? Animated.View : View;

  return (
    <SarhSurface
      tone="background"
      pointerEvents={collapseStyle ? 'box-none' : undefined}
      style={[styles.shell, colorStyles.shell]}
    >
      {collapseStyle ? (
        <View
          pointerEvents="none"
          style={[
            styles.statusFill,
            colorStyles.shell,
            { height: insets.top, borderBottomWidth: 0 },
          ]}
        />
      ) : null}
          <Inner
        pointerEvents={collapseStyle ? 'box-none' : undefined}
        style={[
          styles.inner,
          { paddingHorizontal: gutter, paddingTop: insets.top + space[8] },
          collapseStyle,
        ]}
      >
        <IdentityBox style={identityStyle}>
          <Row justify="between" align="center" style={styles.bar}>
            <View style={styles.avatarBtn}>
              {leading ?? (
                <Pressable
                  onPress={onAvatarPress}
                  style={styles.avatarPress}
                  hitSlop={space[4]}
                  accessibilityRole="button"
                  accessibilityLabel="القائمة الجانبية"
                >
                  <SarhAvatar
                    uri={avatarUri}
                    name={displayName}
                    size="sm"
                    accessibilityLabel={displayName}
                    style={[styles.avatar, colorStyles.avatar]}
                  />
                </Pressable>
              )}
            </View>

            {center ? (
              <View style={styles.centerSlot}>{center}</View>
            ) : (
              <View pointerEvents="none" style={styles.logoSlot}>
                <SarhLogoMark
                  size={SHELL_LOGO_SIZE}
                  color={isDark ? '#FFFFFF' : '#000000'}
                  accentColor={themeColors.electric}
                />
              </View>
            )}

            <View style={styles.toolsCluster}>
              {showNotifications ? (
                <NotificationBellButton
                  bare
                  size={TOOL}
                  iconSize={ICON_SIZE}
                  style={styles.iconBtn}
                  iconColor={themeColors.textPrimary}
                  badgeBorderColor={themeColors.screenRoot}
                />
              ) : (
                <View style={styles.iconBtn} />
              )}
            </View>
          </Row>
        </IdentityBox>
        {children}
      </Inner>
    </SarhSurface>
  );
}

function createColorStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const tokens = scheme === 'light' ? ds.light : ds.dark;
  return StyleSheet.create({
    shell: {
      backgroundColor: tokens.glass,
      borderBottomColor: tokens.glassBorder,
    },
    avatar: {
      borderColor: colors.electric,
      backgroundColor: colors.bgField,
    },
  });
}

const styles = StyleSheet.create({
  shell: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'visible',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusFill: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 2,
  },
  inner: {
    width: '100%',
    overflow: 'visible',
    paddingBottom: space[8],
  },
  bar: {
    width: '100%',
    minHeight: BAR_H,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  logoSlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginHorizontal: space[8],
    justifyContent: 'center',
  },
  toolsCluster: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: TOOL,
    height: TOOL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  avatarBtn: {
    flexGrow: 0,
    flexShrink: 0,
    width: SHELL_AVATAR_BTN,
    height: SHELL_AVATAR_BTN,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarPress: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius[999],
    borderWidth: 2,
  },
});

export default HomeAppBar;
