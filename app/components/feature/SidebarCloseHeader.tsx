import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { Pressable, StyleSheet, View } from 'react-native';

type SidebarCloseHeaderProps = {
  onClose: () => void;
  colors?: ThemeColors;
};

/** Close button row used at the top of slide-out sidebars. */
export function SidebarCloseHeader({ onClose, colors: colorsProp }: SidebarCloseHeaderProps) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
        <AppIcon name="close" size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      alignItems: 'flex-end',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
  });
}

export default SidebarCloseHeader;
