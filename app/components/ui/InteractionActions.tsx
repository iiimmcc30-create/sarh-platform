/**
 * Shared interaction bar + buttons for the Media Viewer overlay and the Feed.
 * All sizes/spacing come from lib/interactionActions.ts (Media Viewer values).
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { getRtlRow } from '@/lib/rtl';
import {
  INTERACTION_BAR_STYLE,
  INTERACTION_BUTTON_STYLE,
  INTERACTION_COUNT_FONT_SIZE,
  INTERACTION_HIT_SLOP,
  INTERACTION_ICON_COUNT_GAP,
  INTERACTION_ICON_SIZE,
  INTERACTION_PENDING_OPACITY,
  INTERACTION_PRESS_IN_MS,
  INTERACTION_PRESS_OPACITY,
  INTERACTION_PRESS_OUT_MS,
  INTERACTION_PRESS_SCALE,
  SHARE_ICON,
  SHARE_LABEL,
  shouldShowInteractionCount,
} from '@/lib/interactionActions';
import { memo, useCallback, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

export type InteractionActionProps = {
  icon: string;
  color: string;
  label: string;
  count?: number;
  /** Count text color. Defaults to the icon color. */
  countColor?: string;
  /** Count formatter. Defaults to the raw number. */
  formatCount?: (count: number) => string;
  /** Font face only; size/color come from the shared tokens. */
  countStyle?: StyleProp<TextStyle>;
  filled?: boolean;
  onPress?: () => void;
  /** Request in flight: dimmed and marked busy. */
  pending?: boolean;
  /** Display-only value (e.g. views): same box, not a button. */
  readOnly?: boolean;
};

function InteractionActionComponent({
  icon,
  color,
  label,
  count,
  countColor,
  formatCount,
  countStyle,
  filled = false,
  onPress,
  pending = false,
  readOnly = false,
}: InteractionActionProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toScale: number, toOpacity: number, duration: number) => {
      Animated.parallel([
        Animated.timing(scale, { toValue: toScale, duration, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: toOpacity, duration, useNativeDriver: true }),
      ]).start();
    },
    [scale, opacity],
  );

  const pressIn = useCallback(
    () => animateTo(INTERACTION_PRESS_SCALE, INTERACTION_PRESS_OPACITY, INTERACTION_PRESS_IN_MS),
    [animateTo],
  );
  const pressOut = useCallback(
    () => animateTo(1, 1, INTERACTION_PRESS_OUT_MS),
    [animateTo],
  );

  const glyph = (
    <>
      <AppIcon name={icon} size={INTERACTION_ICON_SIZE} color={color} variant={filled ? 'sr' : 'rr'} />
      {shouldShowInteractionCount(count) ? (
        <AppText style={[styles.count, countStyle, { color: countColor ?? color }]}>
          {formatCount ? formatCount(count) : String(count)}
        </AppText>
      ) : null}
    </>
  );

  if (readOnly) {
    return (
      <View style={[styles.button, getRtlRow()]} accessibilityRole="text" accessibilityLabel={label}>
        {glyph}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      hitSlop={INTERACTION_HIT_SLOP}
      style={pending ? [styles.button, getRtlRow(), styles.pending] : [styles.button, getRtlRow()]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pending ? { busy: true } : undefined}
    >
      <Animated.View style={[styles.glyph, getRtlRow(), { transform: [{ scale }], opacity }]}>
        {glyph}
      </Animated.View>
    </Pressable>
  );
}

/** One interaction button (icon + optional count) with the shared press feedback. */
export const InteractionAction = memo(InteractionActionComponent);

/** The app share button: shared glyph, label, size, hit area and press feedback. */
export const ShareAction = memo(function ShareAction({
  label = SHARE_LABEL,
  ...rest
}: Omit<InteractionActionProps, 'icon' | 'label'> & { label?: string }) {
  return <InteractionAction icon={SHARE_ICON} label={label} {...rest} />;
});

/** Row container for interaction buttons (RTL-aware, spread edge to edge). */
export function InteractionBar({ children }: { children: ReactNode }) {
  return <View style={[styles.bar, getRtlRow()]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    ...INTERACTION_BAR_STYLE,
  },
  button: {
    ...INTERACTION_BUTTON_STYLE,
  },
  glyph: {
    alignItems: 'center',
    gap: INTERACTION_ICON_COUNT_GAP,
  },
  count: {
    fontSize: INTERACTION_COUNT_FONT_SIZE,
  },
  pending: {
    opacity: INTERACTION_PENDING_OPACITY,
  },
});