import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/** X blue: unread counts on the chat tab and the notifications bell. */
export const COUNT_BADGE_BLUE = '#1D9BF0';

type Props = { count: number; style?: StyleProp<ViewStyle>; testID?: string };

/** Small flat blue circle with the unread count (no gradient, no shadow). */
export function CountBadge({ count, style, testID }: Props) {
  const { colors } = useTheme();
  if (!count || count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <View
      testID={testID}
      accessibilityLabel={`${count} غير مقروء`}
      style={[styles.badge, { borderColor: colors.screenRoot }, style]}
      pointerEvents="none"
    >
      <Text style={styles.text} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    backgroundColor: COUNT_BADGE_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
});

export default CountBadge;
