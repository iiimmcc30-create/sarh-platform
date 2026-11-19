import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design-system/components';
import { SarhAvatar } from '@/design-system/components/SarhAvatar';
import { Row } from '@/design-system/layout';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { MentionSuggestion } from '@/services/mentions';

type Props = {
  items: MentionSuggestion[];
  onPick: (item: MentionSuggestion) => void;
};

/** Suggestion list shown while typing @. Followed accounts are ranked first by the server. */
export function MentionSuggestList({ items, onPick }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  if (items.length === 0) return null;
  return (
    <View style={styles.list} testID="mention-suggest">
      {items.map((item) => {
        const name = item.arabicName || item.displayName || item.username;
        return (
          <Pressable
            key={item.id}
            onPress={() => onPick(item)}
            accessibilityRole="button"
            accessibilityLabel={`${name} @${item.username}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Row gap="sm" align="center">
              <SarhAvatar uri={item.avatar} name={name} size="sm" />
              <View style={styles.copy}>
                <AppText variant="label" numberOfLines={1}>
                  {name}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {`\u2066@${item.username}\u2069`}
                  {item.following ? ' · تتابعه' : ''}
                </AppText>
              </View>
            </Row>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: spacing.sm,
    },
    row: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    pressed: { opacity: 0.75 },
    copy: { flex: 1, minWidth: 0 },
  });
}
