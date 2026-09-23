import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ds } from '@/constants/designSystem';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type HomeProfileMenuProps = {
  visible: boolean;
  onClose: () => void;
  onManageProfile: () => void;
  onSettingsPrivacy: () => void;
  onLogout: () => void;
};

export function HomeProfileMenu({
  visible,
  onClose,
  onManageProfile,
  onSettingsPrivacy,
  onLogout,
}: HomeProfileMenuProps) {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق" />
      <View style={styles.anchor}>
        <View style={styles.menu}>
          <Pressable
            style={[styles.row, getRtlRow()]}
            onPress={() => run(onManageProfile)}
            accessibilityRole="button"
          >
            <Text style={styles.rowText}>إدارة الملف الشخصي</Text>
            <AppIcon name="person-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={[styles.row, getRtlRow()]}
            onPress={() => run(onSettingsPrivacy)}
            accessibilityRole="button"
          >
            <Text style={styles.rowText}>الإعدادات والخصوصية</Text>
            <AppIcon name="settings-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={[styles.row, getRtlRow()]}
            onPress={() => run(onLogout)}
            accessibilityRole="button"
          >
            <Text style={[styles.rowText, styles.logoutText]}>تسجيل الخروج</Text>
            <AppIcon name="log-out-outline" size={18} color={colors.rose} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    anchor: {
      position: 'absolute',
      top: ds.homeAppBar.height,
      right: spacing.md,
      left: spacing.md,
      alignItems: 'flex-end',
    },
    menu: {
      minWidth: 240,
      maxWidth: 320,
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    row: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    rowText: {
      flex: 1,
      ...typography.body,
      color: colors.textPrimary,
      writingDirection: 'rtl',
    },
    logoutText: {
      color: colors.rose,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderHairline || colors.borderSoft,
      marginHorizontal: spacing.md,
    },
  });
}

export default HomeProfileMenu;
