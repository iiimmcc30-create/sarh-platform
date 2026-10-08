import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { radius, spacing } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { arrivalText, tierColorKeys } from '@/lib/subscriberTier';
import { resolveMediaUrl } from '@/services/media';
import { councilUserName } from '@/services/councils';
import type { CouncilArrival } from '@/contexts/CouncilSessionContext';

/** Only fresh events animate (re-opening the room never replays an old entrance). */
export const ARRIVAL_FRESH_MS = 3_000;
const IN_MS = 240;
const HOLD_MS = 2_400;
const OUT_MS = 280;

type Props = { arrival: CouncilArrival | null };

/**
 * «انضم فلان ✦» — short entrance chip for Gold / Blue+ subscribers: fades and slides in
 * from the top, holds, then fades out (RN Animated, native driver). Solid surface,
 * tier hairline, no glow.
 */
export function CouncilArrivalChip({ arrival }: Props) {
  const { colors } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));
  // Entrances older than the room screen (re-opening it) never replay.
  const [mountedAt] = useState(() => Date.now());
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const shown = arrival && arrival.at >= mountedAt - ARRIVAL_FRESH_MS && arrival.key !== doneKey ? arrival : null;
  const shownKey = shown?.key ?? null;

  useEffect(() => {
    if (!shownKey) return undefined;
    anim.stopAnimation();
    anim.setValue(0);
    const seq = Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(anim, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => {
      if (finished) setDoneKey(shownKey);
    });
    return () => seq.stop();
  }, [shownKey, anim]);

  if (!shown) return null;
  const name = councilUserName(shown.user);
  const line = colors[tierColorKeys(shown.tier).line];
  const text = arrivalText(name);
  return (
    <View pointerEvents="none" style={styles.slot}>
      <Animated.View
        testID="council-arrival-chip"
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        style={[
          styles.chip,
          { backgroundColor: colors.bgElevated, borderColor: line },
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
      >
        <SarhAvatar uri={shown.user.avatar ? resolveMediaUrl(shown.user.avatar) : null} name={name} size="xs" />
        <AppText variant="caption" color="textPrimary" numberOfLines={1} style={styles.text}>
          انضم {name} <AppText variant="caption" style={{ color: line }}>✦</AppText>
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Zero-height overlay slot under the header: never pushes the stage. */
  slot: { height: 0, overflow: 'visible', alignItems: 'center', zIndex: 10 },
  chip: {
    position: 'absolute',
    top: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '86%',
    paddingVertical: spacing.xs,
    paddingStart: spacing.xs,
    paddingEnd: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flexShrink: 1 },
});
