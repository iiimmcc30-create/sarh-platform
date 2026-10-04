import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { SarhLogoMark, sarhLogoColors } from '@/components/ui/SarhLogoMark';
import { useTheme } from '@/hooks/useTheme';
import { FEED_VERIFIED_BADGE_SIZE } from '@/lib/verifiedBadge';
import {
  FOUNDER_BADGE_A11Y_LABEL,
  FOUNDER_BADGE_HINT,
  founderBadgeSize,
  isFounderAccount,
} from '@/lib/founderBadge';
import { showToast } from '@/lib/toast';

type FounderBadgeProps = {
  /** Account username; the badge renders only for the founder account. */
  username?: string | null;
  /** Size of the neighbouring verification badge; the mark is ~65% of it. */
  verificationBadgeSize?: number;
};

/**
 * Tiny official Sarh mark (same `SarhLogoMark` as the home app bar) shown
 * next to the founder's name. Not a verification tier: no filled circle,
 * no badge colour. Press (native) shows a toast hint; hover (web) shows a
 * small bubble.
 */
export function FounderBadge({
  username,
  verificationBadgeSize = FEED_VERIFIED_BADGE_SIZE,
}: FounderBadgeProps) {
  const { colors, isDark } = useTheme();
  const [hovered, setHovered] = useState(false);
  if (!isFounderAccount(username)) return null;

  const height = founderBadgeSize(verificationBadgeSize);
  const isWeb = Platform.OS === 'web';

  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel={FOUNDER_BADGE_A11Y_LABEL}
      accessibilityHint={FOUNDER_BADGE_HINT}
      hitSlop={8}
      onPress={() => {
        void showToast(FOUNDER_BADGE_HINT, 'info', 1800);
      }}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      style={[styles.root, { height: verificationBadgeSize }]}
      testID="founder-badge"
    >
      <SarhLogoMark
        size={height}
        {...sarhLogoColors(isDark)}
      />
      {isWeb && hovered ? (
        <View
          pointerEvents="none"
          style={[
            styles.bubble,
            { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
          ]}
        >
          <AppText style={[styles.bubbleText, { color: colors.textPrimary }]} numberOfLines={1}>
            {FOUNDER_BADGE_HINT}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    width: 72,
    marginLeft: -36,
    marginBottom: 4,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  bubbleText: {
    fontSize: 11,
    lineHeight: 15,
  },
});

export default FounderBadge;
