import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Pressable, StyleSheet, View } from 'react-native';
import { getRtlRow } from '@/lib/rtl';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { rtlForwardIcon } from '@/lib/rtl';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
};

/** Section title — cover-style RTL: title on physical right, see-all on physical left. */
export function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel = 'عرض الكل',
}: SectionHeaderProps) {
  const { scheme } = useTheme();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
  }));
  const isDark = scheme === 'dark';

  return (
    <View style={styles.wrap}>
      <View style={[styles.coverTrail, getRtlRow(), { justifyContent: 'space-between' }]}>
        <View style={styles.titleCol}>
          <AppText style={styles.title}>{title}</AppText>
          {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} style={[styles.seeAll, getRtlRow()]}>
            <AppText style={styles.seeAllText}>{seeAllLabel}</AppText>
            <AppIcon
              name={rtlForwardIcon()}
              size={14}
              color={isDark ? colors.textSecondary : colors.textBrandStrong}
            />
          </Pressable>
        ) : (
          <View />
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const isDark = scheme === 'dark';
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: isDark ? spacing.xl : spacing.lg,
      paddingBottom: isDark ? spacing.md : spacing.sm,
    },
    coverTrail: {
      minHeight: 32,
      alignItems: 'center',
    },
    titleCol: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...typography.sectionHeading,
      color: isDark ? colors.textPrimary : colors.electric,
    },
    subtitle: {
      ...typography.secondary,
      color: colors.textMuted,
    },
    seeAll: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      flexShrink: 0,
    },
    seeAllText: {
      ...typography.smallHeading,
      color: isDark ? colors.textSecondary : colors.textBrandStrong,
    },
  });
}

export default SectionHeader;
