import { Image } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { motion, radius, space } from '@/design-system';
import { AppText, resolveSarhButtonColorsForScheme } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  HOME_QUICK_ACCESS_CHIP_VARIANT,
  HOME_QUICK_ACCESS_ITEMS,
  resolveQuickAccessTileMetrics,
} from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

/** Icon / logo box and label line box (20px, unchanged logo size). */
const ICON_BOX = space[20];

export function HomeQuickAccess() {
  const router = useRouter();
  const { gutter, width, maxWidth } = useLayout();
  // Narrow phones: tighter tile padding + label size so the full word fits.
  const tileMetrics = resolveQuickAccessTileMetrics(
    maxWidth != null ? Math.min(width, maxWidth) : width,
    gutter,
  );
  // Same DS variant as the profile Share / Edit pills (SarhButton "secondary"):
  // dark pill + white label/icon + very subtle border in dark, light surface in light.
  const { scheme } = useTheme();
  const chip = resolveSarhButtonColorsForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, 'default');
  const chipPressed = resolveSarhButtonColorsForScheme(
    scheme,
    HOME_QUICK_ACCESS_CHIP_VARIANT,
    'pressed',
  );
  const styles = useThemedStyles(() => createStyles());

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
            style={({ pressed }) => [
              styles.tile,
              {
                paddingHorizontal: tileMetrics.paddingHorizontal,
                backgroundColor: (pressed ? chipPressed : chip).backgroundColor,
                borderColor: (pressed ? chipPressed : chip).borderColor,
              },
              pressed && styles.pressed,
            ]}
          >
            {/* Horizontal (RTL) row: icon, then the label on the same midline. */}
            <Row align="center" gap={tileMetrics.iconGap} style={styles.tileRow}>
              <View style={styles.iconBox}>
                {item.logo ? (
                  <Image source={item.logo} style={styles.logo} contentFit="contain" />
                ) : (
                  <AppIcon
                    name={item.icon ?? 'apps'}
                    size={space[16]}
                    color={chip.contentColor}
                    variant={item.iconTone === 'rose' ? 'sr' : 'rr'}
                  />
                )}
              </View>
              <AppText
                variant="label"
                color="textPrimary"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[styles.label, { fontSize: tileMetrics.fontSize, color: chip.contentColor }]}
              >
                {item.label}
              </AppText>
            </Row>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}

function createStyles() {
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
     * Compact pill chip: fixed height, balanced padding, full pill radius and the
     * DS secondary button's thin border (colors applied inline from the variant,
     * so light/dark follow the same tokens as the profile pills). Content is
     * centred on both axes so the row sits on the chip's midline.
     */
    tile: {
      flex: 1,
      minWidth: 0,
      height: space[40],
      paddingHorizontal: space[12],
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius[999],
      borderWidth: 1,
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
