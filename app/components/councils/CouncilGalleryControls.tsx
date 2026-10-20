import { Pressable, StyleSheet } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { councilGalleryLabel, type CouncilImage } from '@/services/councils';

type Props = {
  image: Pick<CouncilImage, 'gallery'>;
  busy: boolean;
  onStep: (dir: 'next' | 'prev') => void;
  onStop: () => void;
};

/** Host-only controls under the stage gallery: previous / next / stop. */
export function CouncilGalleryControls({ image, busy, onStep, onStop }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const label = councilGalleryLabel(image);
  return (
    <Row gap="md" align="center" style={styles.row} testID="council-gallery-controls">
      <Pressable
        disabled={busy}
        onPress={() => onStep('prev')}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="الصورة السابقة"
      >
        <AppIcon name="chevron-forward" size={18} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="caption" color="textSecondary" style={styles.label}>
        {label ?? ''}
      </AppText>
      <Pressable
        disabled={busy}
        onPress={() => onStep('next')}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="الصورة التالية"
      >
        <AppIcon name="chevron-back" size={18} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={onStop}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="إيقاف العرض"
      >
        <AppIcon name="close-circle-outline" size={18} color={colors.textPrimary} />
      </Pressable>
    </Row>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { justifyContent: 'center' },
    label: { minWidth: 48, textAlign: 'center' },
    btn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: spacing.xs,
    },
  });
}
