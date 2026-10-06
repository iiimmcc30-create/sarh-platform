import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Centered calm state (web placeholder, ended, banned, removed, not found). */
export function CouncilNotice({ icon = 'mic', title, message, actionLabel, onAction }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  return (
    <Stack gap="md" align="center" style={styles.wrap}>
      <View style={styles.iconCircle}>
        <AppIcon name={icon} size={26} color={colors.textSecondary} />
      </View>
      <AppText variant="heading3" color="textPrimary" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodySmall" color="textMuted" align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <SarhButton title={actionLabel} variant="secondary" shape="pill" onPress={onAction} />
      ) : null}
    </Stack>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
