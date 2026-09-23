import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { motion } from '@/design-system';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  closeActionSheet,
  getActionSheetState,
  subscribeActionSheet,
} from '@/lib/actionSheet';
import { getRtlText, alignInlineEnd, getRtlRow, rtlForwardIcon } from '@/lib/rtl';

/** Global host — mount once in root layout so action sheets work on web + native. */
export function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeActionSheet(() => setTick((n) => n + 1)), []);

  const state = getActionSheetState();
  const visible = !!state;
  void tick;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => closeActionSheet(null)}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeActionSheet(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <LinearGradient
            colors={gradients.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetInner}
          >
            <LinearGradient
              colors={gradients.rim}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rim}
            />

            <View style={styles.handle} />

            {state?.title ? (
              <View style={styles.header}>
                <Text style={styles.title}>{state.title}</Text>
                {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
              </View>
            ) : null}

            <View style={styles.list}>
              {(state?.items ?? []).map((item) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.item,
                    getRtlRow(),
                    item.destructive && styles.itemDanger,
                    item.cancel && styles.itemCancel,
                    pressed && styles.itemPressed,
                  ]}
                  onPress={() => closeActionSheet(item.cancel ? null : item.key)}
                >
                  {item.icon ? (
                    <View
                      style={[
                        styles.itemIconWrap,
                        item.destructive && styles.itemIconWrapDanger,
                        item.cancel && styles.itemIconWrapMuted,
                      ]}
                    >
                      <AppIcon
                        name={item.icon}
                        size={18}
                        color={
                          item.destructive
                            ? colors.rose
                            : item.cancel
                              ? colors.textMuted
                              : colors.textPrimary
                        }
                      />
                    </View>
                  ) : null}

                  <View style={styles.itemTextWrap}>
                    <Text
                      style={[
                        styles.itemText,
                        item.destructive && styles.itemTextDanger,
                        item.cancel && styles.itemTextCancel,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                    ) : null}
                  </View>

                  {!item.cancel ? (
                    <AppIcon name={rtlForwardIcon()} size={16} color={colors.textSubtle} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.bgOverlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    sheetInner: {
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      position: 'relative',
    },
    rim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.borderStrong,
      alignSelf: 'center',
      marginBottom: spacing.sm,
    },
    header: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingBottom: spacing.xs,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    message: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    list: { gap: spacing.sm, marginTop: spacing.sm },
    item: {
      minHeight: 58,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      gap: spacing.md,
    },
    itemDanger: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderColor: 'rgba(239,68,68,0.28)',
    },
    itemCancel: {
      backgroundColor: colors.bgSurface,
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    itemPressed: {
      opacity: motion.press.opacity,
      transform: [{ scale: motion.press.scale }],
    },
    itemIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgGlass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    itemIconWrapDanger: {
      backgroundColor: 'rgba(239,68,68,0.14)',
      borderColor: 'rgba(239,68,68,0.28)',
    },
    itemIconWrapMuted: {
      backgroundColor: colors.bgSurface,
    },
    itemTextWrap: {
      flex: 1,
      ...alignInlineEnd(),
      gap: 2,
    },
    itemText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      ...getRtlText(),
    },
    itemTextDanger: { color: colors.rose },
    itemTextCancel: { color: colors.textMuted },
    itemSubtitle: {
      ...typography.micro,
      color: colors.textMuted,
      ...getRtlText(),
    },
    itemChevron: {
      color: colors.textSubtle,
    },
  });
}
