import { Image } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { motion, radius, space } from '@/design-system';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  HOME_QUICK_ACCESS_ITEMS,
  type HomeQuickAccessItem,
} from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

function iconColor(
  item: HomeQuickAccessItem,
  theme: { rose: string; electric: string; silver: string; electricBright: string },
): string {
  if (item.iconTone === 'rose') return theme.rose;
  if (item.iconTone === 'leaf') return theme.electric;
  if (item.iconTone === 'silver') return theme.silver;
  return theme.electricBright;
}

export function HomeQuickAccess() {
  const router = useRouter();
  const { gutter } = useLayout();
  const { colors: themeColors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c.bgElevated, c.borderHairline));

  return (
    <View style={styles.wrap}>
      <View style={[styles.sectionHead, { paddingHorizontal: gutter }]}>
        <AppText variant="heading2" color="textPrimary">
          الوصول السريع
        </AppText>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.rail, { paddingHorizontal: gutter }]}
      >
        {HOME_QUICK_ACCESS_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => safePush(item.href, undefined, router)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Row align="center" gap="sm">
              {item.logo ? (
                <Image source={item.logo} style={styles.logo} contentFit="contain" />
              ) : (
                <AppIcon
                  name={item.icon ?? 'apps'}
                  size={space[16]}
                  color={iconColor(item, themeColors)}
                  variant={item.iconTone === 'rose' ? 'sr' : 'rr'}
                />
              )}
              <AppText variant="label" color="textPrimary" numberOfLines={1}>
                {item.label}
              </AppText>
            </Row>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(chipBg: string, chipBorder: string) {
  return StyleSheet.create({
    wrap: {
      paddingBottom: 0,
    },
    sectionHead: {
      paddingTop: space[8],
      paddingBottom: space[12],
    },
    rail: {
      gap: space[8],
      alignItems: 'center',
      flexGrow: 0,
    },
    chip: {
      flexShrink: 0,
      flexGrow: 0,
      minHeight: space[40],
      paddingHorizontal: space[16],
      paddingVertical: space[8],
      borderRadius: radius[12],
      backgroundColor: chipBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chipBorder,
    },
    pressed: {
      opacity: motion.opacity.pressed,
    },
    logo: {
      width: space[20],
      height: space[20],
      borderRadius: radius[999],
    },
  });
}

export default HomeQuickAccess;
