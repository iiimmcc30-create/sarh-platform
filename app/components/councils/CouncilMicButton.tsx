// «المجالس» — round mic toggle (room bar + mini player). Open = accent fill (white in
// dark / black in light) with the on-accent glyph; closed = quiet surface + mic-off;
// moderator-muted = disabled with a red mic-off.
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  muted: boolean;
  mutedByModerator?: boolean;
  loading?: boolean;
  /** 64 in the room bar, 40 in the mini player. */
  size?: number;
  onPress: () => void;
};

export function councilMicLabel(muted: boolean, mutedByModerator?: boolean): string {
  if (mutedByModerator) return 'مكتوم من المشرف';
  return muted ? 'فتح الميكروفون' : 'إغلاق الميكروفون';
}

export function CouncilMicButton({ muted, mutedByModerator = false, loading = false, size = 64, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const open = !muted && !mutedByModerator;
  const disabled = mutedByModerator || loading;

  const pressTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: toValue === 1 ? 6 : 0 }).start();

  const glyph = Math.round(size * 0.4);
  const iconColor = open ? colors.onElectric : mutedByModerator ? colors.danger : colors.textPrimary;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID="council-mic-button"
        onPress={onPress}
        onPressIn={() => pressTo(0.92)}
        onPressOut={() => pressTo(1)}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={councilMicLabel(muted, mutedByModerator)}
        accessibilityState={{ disabled, checked: open }}
        style={[
          styles.base,
          { width: size, height: size },
          open ? styles.open : styles.closed,
          mutedByModerator && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <AppIcon name={open ? 'mic' : 'mic-off'} size={glyph} color={iconColor} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    open: { backgroundColor: colors.electric },
    closed: {
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
    disabled: { opacity: 0.55 },
  });
}
