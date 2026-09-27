import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { getRtlRow } from '@/lib/rtl';
import {
  FEED_VERIFIED_BADGE_SIZE,
  VERIFIED_BADGE_GAP,
  shouldShowVerifiedBadge,
} from '@/lib/verifiedBadge';

export type VerifiedInlineNameProps = {
  name: string;
  verified?: boolean;
  badgeSize?: number;
  nameStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  /** Optional custom name node (e.g. a DS AppText variant). Badge logic stays shared. */
  children?: ReactNode;
};

/**
 * Name then badge - logical row (badge sits after the name toward inline end).
 * Same badge, size, gap and centre alignment as the Feed (PostItem) name row.
 */
export function VerifiedInlineName({
  name,
  verified = false,
  badgeSize = FEED_VERIFIED_BADGE_SIZE,
  nameStyle,
  numberOfLines = 1,
  style,
  children,
}: VerifiedInlineNameProps) {
  return (
    <View style={[styles.root, getRtlRow(), style]}>
      {children ?? (
        <AppText style={[styles.nameInline, nameStyle]} numberOfLines={numberOfLines}>
          {name}
        </AppText>
      )}
      {shouldShowVerifiedBadge(verified) ? <VerificationBadge size={badgeSize} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: VERIFIED_BADGE_GAP,
    flexShrink: 1,
    maxWidth: '100%',
  },
  nameInline: {
    width: 'auto',
    flexShrink: 1,
  },
});

export default VerifiedInlineName;
