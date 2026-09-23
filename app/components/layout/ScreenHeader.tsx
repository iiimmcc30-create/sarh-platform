// Powered by OnSpace.AI
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { motion } from '@/design-system';
import { AppText, SarhBackButton } from '@/design-system/components';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ds } from '@/constants/designSystem';
import { controls, layout, radius, spacing, type ThemeColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { alignInlineEnd, getRtlRow } from '@/lib/rtl';

/**
 * Navigation chrome by context (Architecture V2):
 *   screen — internal page: back + centered title + one action
 *   tab    — root tab bar header: identity at the inline start, never a back
 *   sheet  — bottom sheet: grabber + centered title + close
 *   modal  — full-screen decision: cancel + centered title + confirm
 *
 * `screen` is the default and renders exactly like before this variant existed.
 */
export type ScreenHeaderVariant = 'screen' | 'tab' | 'sheet' | 'modal';

interface ScreenHeaderProps {
  title: string;
  arabic?: string;
  showBack?: boolean;
  rightIcon?: string;
  onRightPress?: () => void;
  showSidebar?: boolean;
  onSidebar?: () => void;
  onBackPress?: () => void;
  rightAccessibilityLabel?: string;
  variant?: ScreenHeaderVariant;
  /** `sheet` — dismiss control. */
  onClose?: () => void;
  closeAccessibilityLabel?: string;
  /** `modal` — leading dismiss action. */
  cancelLabel?: string;
  onCancel?: () => void;
  /** `modal` — trailing confirm action. */
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
}

export function ScreenHeader({
  title,
  arabic,
  showBack,
  rightIcon,
  onRightPress,
  showSidebar,
  onSidebar,
  onBackPress,
  rightAccessibilityLabel,
  variant = 'screen',
  onClose,
  closeAccessibilityLabel,
  cancelLabel = 'إلغاء',
  onCancel,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
}: ScreenHeaderProps) {
  const router = useRouter();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
  }));
  const { gutter } = useLayout();

  const isTab = variant === 'tab';
  const isSheet = variant === 'sheet';
  const isModal = variant === 'modal';
  const canBack = Boolean(showBack) && variant === 'screen';

  const leading = isModal ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cancelLabel}
      onPress={onCancel}
      hitSlop={12}
      style={({ pressed }) => [styles.textAction, pressed && styles.iconBtnPressed]}
    >
      <AppText variant="button" color="textSecondary" numberOfLines={1}>
        {cancelLabel}
      </AppText>
    </Pressable>
  ) : canBack ? (
    <SarhBackButton
      onPress={() => (onBackPress ? onBackPress() : router.back())}
      color={colors.textPrimary}
      style={styles.backBtn}
    />
  ) : showSidebar && !isSheet && !isModal ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="فتح القائمة"
      onPress={onSidebar}
      hitSlop={12}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <AppIcon name="menu-burger" size={ds.icon.md} color={colors.textPrimary} />
    </Pressable>
  ) : null;

  const trailing = isModal && confirmLabel ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={confirmLabel}
      accessibilityState={{ disabled: confirmDisabled }}
      disabled={confirmDisabled}
      onPress={onConfirm}
      hitSlop={12}
      style={({ pressed }) => [styles.textAction, pressed && styles.iconBtnPressed]}
    >
      <AppText
        variant="button"
        color={confirmDisabled ? 'textMuted' : 'primary'}
        numberOfLines={1}
      >
        {confirmLabel}
      </AppText>
    </Pressable>
  ) : isSheet && onClose ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={closeAccessibilityLabel ?? 'إغلاق'}
      onPress={onClose}
      hitSlop={12}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <AppIcon name="close" size={ds.icon.md} color={colors.textPrimary} />
    </Pressable>
  ) : rightIcon ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rightAccessibilityLabel ?? 'إجراء إضافي'}
      onPress={onRightPress}
      hitSlop={12}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <AppIcon name={rightIcon} size={ds.icon.md} color={colors.textPrimary} />
    </Pressable>
  ) : null;

  const sideStyle = isModal ? styles.sideAuto : styles.side;

  const bar = (
    <View style={[styles.container, getRtlRow(), { paddingHorizontal: gutter }]}>
      <View style={sideStyle}>{leading}</View>

      <View style={[styles.titleWrap, isTab && styles.titleWrapStart]}>
        <AppText
          variant="heading2"
          color="textPrimary"
          align={isTab ? 'auto' : 'center'}
          numberOfLines={1}
          style={isTab ? styles.titleStart : styles.title}
        >
          {title}
        </AppText>
        {arabic ? (
          <AppText
            variant="caption"
            color="textMuted"
            align={isTab ? 'auto' : 'center'}
            numberOfLines={1}
            style={isTab ? styles.arabicStart : styles.arabic}
          >
            {arabic}
          </AppText>
        ) : null}
      </View>

      <View style={[sideStyle, alignInlineEnd()]}>{trailing}</View>
    </View>
  );

  if (!isSheet) return bar;

  return (
    <View style={styles.sheetShell}>
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>
      {bar}
    </View>
  );
}

function createStyles(colors: ThemeColors, _scheme: 'light' | 'dark') {
  return StyleSheet.create({
    container: {
      ...getRtlRow(),
      alignItems: 'center',
      minHeight: layout.headerHeight,
      backgroundColor: colors.screenRoot,
    },
    sheetShell: {
      backgroundColor: colors.screenRoot,
    },
    grabberWrap: {
      alignItems: 'center',
      paddingTop: spacing.sm,
    },
    grabber: {
      width: 36,
      height: 4,
      borderRadius: radius.sm,
      backgroundColor: colors.borderStrong,
    },
    side: {
      width: controls.iconButton,
    },
    sideAuto: {
      minWidth: controls.iconButton,
      justifyContent: 'center',
    },
    /** Physical LTR shell — keeps centered Arabic titles visually correct under app RTL. */
    titleWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    titleWrapStart: {
      alignItems: 'flex-start',
    },
    title: {
      width: '100%',
      textAlign: 'center',
      writingDirection: 'rtl',
    },
    titleStart: {
      width: '100%',
      writingDirection: 'rtl',
    },
    arabic: {
      marginTop: 1,
      width: '100%',
      textAlign: 'center',
      writingDirection: 'rtl',
    },
    arabicStart: {
      marginTop: 1,
      width: '100%',
      writingDirection: 'rtl',
    },
    textAction: {
      minHeight: controls.iconButton,
      justifyContent: 'center',
    },
    iconBtn: {
      width: controls.iconButton,
      height: controls.iconButton,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
      borderWidth: 0,
    },
    /** Back button — same touch target but no background box. */
    backBtn: {
      width: controls.iconButton,
      height: controls.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    iconBtnPressed: {
      transform: [{ scale: motion.press.scale }],
      opacity: motion.press.opacity,
    },
  });
}

export default ScreenHeader;
