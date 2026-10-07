import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { interactionRepostColor } from '@/lib/interactionActions';
import { getRtlRow } from '@/lib/rtl';

type ProfileRepostAttributionProps = {
  name: string;
};

export function ProfileRepostAttribution({ name }: ProfileRepostAttributionProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { scheme } = useTheme();
  return (
    <View style={[styles.row, getRtlRow()]}>
      <AppIcon name="repeat-2" size={14} color={interactionRepostColor(scheme)} />
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
