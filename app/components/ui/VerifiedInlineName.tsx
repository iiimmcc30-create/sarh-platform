import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { getRtlRow } from '@/lib/rtl';

export type VerifiedInlineNameProps = {
  name: string;
  verified?: boolean;
  badgeSize?: number;
  nameStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
};

/** Name then badge — logical row (badge sits after the name toward inline end). */
export function VerifiedInlineName({
  name,
  verified = false,
  badgeSize = 14,
  nameStyle,
  numberOfLines = 1,
  style,
}: VerifiedInlineNameProps) {
  return (
    <View style={[styles.root, getRtlRow(), style]}>
      <AppText style={[styles.nameInline, nameStyle]} numberOfLines={numberOfLines}>
        {name}
      </AppText>
      {verified ? <VerificationBadge size={badgeSize} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 4,
    flexShrink: 1,
    maxWidth: '100%',
  },
  nameInline: {
    width: 'auto',
    flexShrink: 1,
  },
});

export default VerifiedInlineName;
