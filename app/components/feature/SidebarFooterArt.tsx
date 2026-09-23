import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { StyleSheet, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { spacing, type ThemeColors } from '@/constants/theme';

export function SidebarFooterArt() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: themeColors }) => createStyles(themeColors));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <LinearGradient
        colors={['transparent', `${colors.electric}12`, `${colors.electric}22`]}
        style={styles.hillBack}
      />
      <LinearGradient
        colors={['transparent', `${colors.electric}18`, `${colors.electric}30`]}
        style={styles.hillFront}
      />
      <View style={styles.scene}>
        <View style={styles.mountainLeft} />
        <View style={styles.mountainRight} />
        <View style={styles.tent} />
        <View style={styles.palmLeft} />
        <View style={styles.palmRight} />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      height: 150,
      marginTop: spacing.lg,
      overflow: 'hidden',
    },
    hillBack: {
      position: 'absolute',
      left: -20,
      right: -20,
      bottom: 0,
      height: 90,
      borderTopLeftRadius: 120,
      borderTopRightRadius: 120,
    },
    hillFront: {
      position: 'absolute',
      left: -10,
      right: -10,
      bottom: 0,
      height: 64,
      borderTopLeftRadius: 100,
      borderTopRightRadius: 100,
    },
    scene: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 18,
    },
    mountainLeft: {
      position: 'absolute',
      left: 24,
      bottom: 42,
      width: 0,
      height: 0,
      borderLeftWidth: 34,
      borderRightWidth: 34,
      borderBottomWidth: 52,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: `${colors.electric}28`,
    },
    mountainRight: {
      position: 'absolute',
      right: 30,
      bottom: 36,
      width: 0,
      height: 0,
      borderLeftWidth: 28,
      borderRightWidth: 28,
      borderBottomWidth: 44,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: `${colors.electric}22`,
    },
    tent: {
      width: 42,
      height: 28,
      backgroundColor: `${colors.electric}35`,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      marginBottom: 8,
    },
    palmLeft: {
      position: 'absolute',
      left: 58,
      bottom: 24,
      width: 4,
      height: 34,
      borderRadius: 2,
      backgroundColor: `${colors.electric}40`,
    },
    palmRight: {
      position: 'absolute',
      right: 64,
      bottom: 20,
      width: 4,
      height: 30,
      borderRadius: 2,
      backgroundColor: `${colors.electric}35`,
    },
  });
}
