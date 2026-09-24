import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';

const REPOST_GREEN = '#00BA7C';

type ProfileRepostAttributionProps = {
  name: string;
};

export function ProfileRepostAttribution({ name }: ProfileRepostAttributionProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <View style={[styles.row, getRtlRow()]}>
      <AppIcon name="repeat-2" size={14} color={REPOST_GREEN} />
      <AppText style={styles.text} numberOfLines={1}>
        {name} أعاد النشر
      </AppText>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    text: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 1,
    },
  });
}
