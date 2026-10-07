/**
 * Shared interaction bar + buttons for the Media Viewer overlay, the Feed and the
 * post detail page. All sizes/spacing come from lib/interactionActions.ts (Media
 * Viewer values; `variant="detail"` uses the larger X post-page tokens).
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { getRtlRow } from '@/lib/rtl';
import {
  INTERACTION_BAR_STYLE,
  INTERACTION_BUTTON_STYLE,
  INTERACTION_COMPACT_BUTTON_STYLE,
  INTERACTION_COMPACT_HIT_SLOP,
  INTERACTION_COUNT_FONT_SIZE,
  INTERACTION_COUNT_LINE_HEIGHT,
  INTERACTION_COUNT_MIN_FONT_SCALE,
  INTERACTION_DETAIL_BAR_STYLE,
  INTERACTION_DETAIL_BUTTON_STYLE,
  INTERACTION_DETAIL_COUNT_FONT_SIZE,
  INTERACTION_DETAIL_COUNT_LINE_HEIGHT,
  INTERACTION_DETAIL_HIT_SLOP,
  INTERACTION_DETAIL_ICON_SIZE,
  INTERACTION_HIT_SLOP,
  INTERACTION_ICON_SIZE,
  INTERACTION_PENDING_OPACITY,
  INTERACTION_PULSE_DOWN_MS,
  INTERACTION_PULSE_SCALE,
  INTERACTION_PULSE_UP_MS,
  SHARE_ICON,
  SHARE_LABEL,
  INTERACTION_TRAILING_GROUP_STYLE,
  shouldShowInteractionCount,
} from '@/lib/interactionActions';
import { createContext, memo, useCallback, useContext, useState, type ReactNode } from 'react';
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
  const [scale] = useState(() => new Animated.Value(1));
  /** Inside InteractionTrailingGroup: fixed icon-only box, no count. */
  const compact = useContext(CompactContext);
  /** Inside <InteractionBar variant="detail">: larger icon/count, natural width. */
  const detail = useContext(DetailContext);
  const boxStyle = compact ? styles.compact : detail ? styles.detailButton : styles.button;
  const iconSize = detail ? INTERACTION_DETAIL_ICON_SIZE : INTERACTION_ICON_SIZE;
  const iconBoxStyle = detail ? styles.detailIcon : styles.icon;
  const hitSlop = compact
    ? INTERACTION_COMPACT_HIT_SLOP
    : detail
      ? INTERACTION_DETAIL_HIT_SLOP
      : INTERACTION_HIT_SLOP;

  // Icon-only pulse (transform, native driver): never changes layout.
  const pulse = useCallback(() => {
    scale.stopAnimation();
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: INTERACTION_PULSE_SCALE,
        duration: INTERACTION_PULSE_UP_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, { toValue: 1, duration: INTERACTION_PULSE_DOWN_MS, useNativeDriver: true }),
    ]).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    pulse();
    onPress?.();
  }, [pulse, onPress]);

  // Same icon box for outline and filled; the count shrinks to fit instead of widening.
  const iconNode = (
    <AppIcon name={icon} size={iconSize} color={color} variant={filled ? 'sr' : 'rr'} />
  );
  const countNode = !compact && shouldShowInteractionCount(count) ? (
    <AppText
      style={[styles.count, detail ? styles.detailCount : null, countStyle, { color: countColor ?? color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={INTERACTION_COUNT_MIN_FONT_SCALE}
    >
      {formatCount ? formatCount(count) : String(count)}
    </AppText>
  ) : null;

  if (readOnly) {
    return (
      <View style={[boxStyle, getRtlRow()]} accessibilityRole="text" accessibilityLabel={label}>
        <View style={iconBoxStyle}>{iconNode}</View>
        {countNode}
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={hitSlop}
      style={pending ? [boxStyle, getRtlRow(), styles.pending] : [boxStyle, getRtlRow()]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pending ? { busy: true } : undefined}
    >
      <Animated.View style={[iconBoxStyle, { transform: [{ scale }] }]}>{iconNode}</Animated.View>
      {countNode}
    </Pressable>
  );
}

const CompactContext = createContext(false);
const DetailContext = createContext(false);

/** One interaction button (icon + optional count) with the shared press feedback. */
export const InteractionAction = memo(InteractionActionComponent);

/** The app share button: shared glyph, label, size, hit area and press feedback. */
export const ShareAction = memo(function ShareAction({
  label = SHARE_LABEL,
  ...rest
}: Omit<InteractionActionProps, 'icon' | 'label'> & { label?: string }) {
  return <InteractionAction icon={SHARE_ICON} label={label} {...rest} />;
});

/**
 * Row container for interaction buttons (RTL-aware). Main buttons (reply, repost,
 * like, views) share the width equally, icon then count; wrap bookmark + share in
 * `InteractionTrailingGroup` to place them together at the row's end edge.
 *
 * `variant="detail"` (post page, X layout): every button keeps its natural width
 * and the row spreads them edge to edge, with larger icons and counts.
 */
export function InteractionBar({
  children,
  variant = 'feed',
}: {
  children: ReactNode;
  variant?: 'feed' | 'detail';
}) {
  if (variant === 'detail') {
    return (
      <DetailContext.Provider value>
        <View style={[styles.detailBar, getRtlRow()]} testID="interaction-bar-detail">
          {children}
        </View>
      </DetailContext.Provider>
    );
  }
  return <View style={[styles.bar, getRtlRow()]}>{children}</View>;
}

/** Compact trailing group (bookmark + share): icon only, share flush with the row edge. */
export function InteractionTrailingGroup({ children }: { children: ReactNode }) {
  return (
    <CompactContext.Provider value>
      <View style={[styles.trailing, getRtlRow()]}>{children}</View>
    </CompactContext.Provider>
  );
}

const styles = StyleSheet.create({
  bar: {
    ...INTERACTION_BAR_STYLE,
  },
  button: {
    ...INTERACTION_BUTTON_STYLE,
  },
  compact: {
    ...INTERACTION_COMPACT_BUTTON_STYLE,
  },
  trailing: {
    ...INTERACTION_TRAILING_GROUP_STYLE,
  },
  icon: {
    width: INTERACTION_ICON_SIZE,
    height: INTERACTION_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBar: {
    ...INTERACTION_DETAIL_BAR_STYLE,
  },
  detailButton: {
    ...INTERACTION_DETAIL_BUTTON_STYLE,
  },
  detailIcon: {
    width: INTERACTION_DETAIL_ICON_SIZE,
    height: INTERACTION_DETAIL_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCount: {
    fontSize: INTERACTION_DETAIL_COUNT_FONT_SIZE,
    lineHeight: INTERACTION_DETAIL_COUNT_LINE_HEIGHT,
  },
  count: {
    flexShrink: 1,
    fontSize: INTERACTION_COUNT_FONT_SIZE,
    lineHeight: INTERACTION_COUNT_LINE_HEIGHT,
    fontVariant: ['tabular-nums'],
  },
  pending: {
    opacity: INTERACTION_PENDING_OPACITY,
  },
});