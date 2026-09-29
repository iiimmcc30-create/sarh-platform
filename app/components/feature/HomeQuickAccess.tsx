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
import { Pressable, StyleSheet, View } from 'react-native';

/** Icon / logo box and label line box (20px, unchanged logo size). */
const ICON_BOX = space[20];

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
        <AppText variant="heading3" color="textPrimary">
          الوصول السريع
        </AppText>
      </View>
      {/*
        One horizontal RTL row: every shortcut is a flex: 1 tile with an equal
        gap, so the tiles share the full width by the real item count (no
        fixed grid, no empty slot).
      */}
      <Row align="center" gap="sm" style={[styles.rail, { paddingHorizontal: gutter }]}>
        {HOME_QUICK_ACCESS_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => safePush(item.href, undefined, router)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            {/* Horizontal (RTL) row: icon, then the label on the same midline. */}
            <Row align="center" gap="sm" style={styles.tileRow}>
              <View style={styles.iconBox}>
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
              </View>
              <AppText variant="label" color="textPrimary" numberOfLines={1} style={styles.label}>
                {item.label}
              </AppText>
            </Row>
          </Pressable>
        ))}
      </Row>
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
      alignItems: 'stretch',
    },
    /**
     * Compact tile: fixed height, balanced padding, light corners and a thin
     * calm border. Content is centred on both axes so the row sits on the
     * tile's midline (it used to be pinned to the top of a taller chip).
     */
    tile: {
      flex: 1,
      minWidth: 0,
      height: space[40],
      paddingHorizontal: space[12],
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius[12],
      backgroundColor: chipBg,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    tileRow: {
      height: ICON_BOX,
      maxWidth: '100%',
    },
    /** Same box for logos and glyph icons, so every label shares one midline. */
    iconBox: {
      width: ICON_BOX,
      height: ICON_BOX,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Line box = icon box; no Android font padding pushing the glyphs off-centre. */
    label: {
      flexShrink: 1,
      lineHeight: ICON_BOX,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    pressed: {
      opacity: motion.opacity.pressed,
    },
    logo: {
      width: ICON_BOX,
      height: ICON_BOX,
      borderRadius: radius[999],
    },
  });
}

export default HomeQuickAccess;
