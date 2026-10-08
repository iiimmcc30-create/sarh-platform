// «المجالس» room header: minimise (keeps listening) · title · red «مغادرة» + more (…).
import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ds } from '@/constants/designSystem';
import { controls, layout, spacing, type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { AppText } from '@/design-system/components';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { GOLD_COUNCIL_TAG, type SubscriberTier } from '@/lib/subscriberTier';

/** Both sides share one width so the title stays centred. */
const SIDE = controls.iconButton * 2 + spacing.lg;

type Props = {
  title: string;
  onMinimize: () => void;
  onLeave?: () => void;
  onMore?: () => void;
  /** Host subscriber tier — Gold adds a quiet gold accent under the title. */
  hostTier?: SubscriberTier | null;
};

export function CouncilRoomHeader({ title, onMinimize, onLeave, onMore, hostTier }: Props) {
  const gold = hostTier === 'gold';
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const { gutter } = useLayout();
  return (
    <View
      style={[styles.container, getRtlRow(), { paddingHorizontal: gutter }, gold && styles.goldContainer]}
      testID={gold ? 'council-header-gold' : undefined}
    >
      <View style={[styles.side, getRtlRow()]}>
        <Pressable
          testID="council-minimize"
          onPress={onMinimize}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="تصغير المجلس ومتابعة الاستماع"
          style={({ pressed }) => [styles.iconBtn, styles.plain, pressed && styles.pressed]}
        >
          <AppIcon name="chevron-down" size={ds.icon.md} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={[styles.titleWrap, gold && styles.titleWrapGold]}>
        <AppText variant="heading2" color="textPrimary" align="center" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        {gold ? (
          <View style={[styles.goldMark, getRtlRow()]} accessibilityLabel={GOLD_COUNCIL_TAG}>
            <View style={[styles.goldRule, { backgroundColor: colors.tierGold }]} />
            <AppText variant="micro" style={{ color: colors.tierGold }} numberOfLines={1}>
              ✦ {GOLD_COUNCIL_TAG}
            </AppText>
            <View style={[styles.goldRule, { backgroundColor: colors.tierGold }]} />
          </View>
        ) : null}
      </View>

      <View style={[styles.side, styles.trailing, getRtlRow()]}>
        {onLeave ? (
          <Pressable
            testID="council-leave"
            onPress={onLeave}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="مغادرة المجلس"
            style={({ pressed }) => [styles.textBtn, pressed && styles.pressed]}
          >
            <AppText variant="button" color="danger" numberOfLines={1}>
              مغادرة
            </AppText>
          </Pressable>
        ) : null}
        {onMore ? (
          <Pressable
            onPress={onMore}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="خيارات المجلس"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <AppIcon name="ellipsis-horizontal" size={ds.icon.md} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      minHeight: layout.headerHeight,
      backgroundColor: colors.screenRoot,
    },
    /** Gold host: hairline gold base line, a little more air around the title. */
    goldContainer: {
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.tierGold,
    },
    side: { width: SIDE, alignItems: 'center' },
    trailing: { justifyContent: 'flex-end', gap: spacing.sm },
    titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
    titleWrapGold: { gap: 2 },
    title: { width: '100%', textAlign: 'center', writingDirection: 'rtl' },
    goldMark: { alignItems: 'center', gap: spacing.xs },
    goldRule: { width: 14, height: StyleSheet.hairlineWidth * 2 },
    iconBtn: {
      width: controls.iconButton,
      height: controls.iconButton,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    plain: { backgroundColor: 'transparent' },
    textBtn: { minHeight: controls.iconButton, justifyContent: 'center' },
    pressed: { transform: [{ scale: motion.press.scale }], opacity: motion.press.opacity },
  });
}
