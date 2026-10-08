// «تمييز مجاني (متبقي X)» — first option in the boost sheets for Blue+/Gold.
// Fetches its own quota; renders nothing for users without the perk (or while
// the featured service is switched off). Applying never touches payments.
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  applyFreeBoost,
  fetchFreeBoostQuota,
  freeBoostSubtitle,
  freeBoostTitle,
  type FreeBoostApplied,
  type FreeBoostQuota,
} from '@/services/freeBoost';

type Props = {
  listingId: string;
  /** False hides the option (e.g. the featured service is disabled by admin). */
  enabled?: boolean;
  onApplied?: (result: FreeBoostApplied) => void;
  style?: StyleProp<ViewStyle>;
};

export function FreeBoostOption({ listingId, enabled = true, onApplied, style }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [quota, setQuota] = useState<FreeBoostQuota | null>(null);
  const [applying, setApplying] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchFreeBoostQuota().then((q) => {
      if (!alive) return;
      setQuota(q);
      if (q?.eligible) {
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    });
    return () => {
      alive = false;
    };
  }, [enabled, fade, listingId]);

  const apply = useCallback(async () => {
    if (!quota || quota.remaining <= 0 || applying) return;
    setApplying(true);
    try {
      const result = await applyFreeBoost(listingId);
      setQuota({ ...quota, used: quota.used + 1, remaining: Math.max(0, result.remaining ?? quota.remaining - 1) });
      onApplied?.(result);
    } catch (err) {
      Alert.alert('تعذّر التمييز', err instanceof Error ? err.message : 'حاول مرة أخرى');
      void fetchFreeBoostQuota().then((q) => q && setQuota(q));
    } finally {
      setApplying(false);
    }
  }, [applying, listingId, onApplied, quota]);

  if (!enabled || !quota?.eligible) return null;
  const available = quota.remaining > 0;

  return (
    <Animated.View style={[{ opacity: fade, transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => void apply()}
        disabled={!available || applying}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
        accessibilityRole="button"
        accessibilityState={{ disabled: !available || applying }}
        accessibilityLabel={freeBoostTitle(quota.remaining)}
        style={[styles.card, available ? styles.cardAvailable : styles.cardUsed]}
        testID="free-boost-option"
      >
        <Row gap="md" align="center">
          <View style={[styles.iconWrap, available ? styles.iconWrapAvailable : null]}>
            <AppIcon name="star-outline" size={18} color={available ? colors.tierGold : colors.textMuted} />
          </View>
          <Stack gap="xs" style={styles.text}>
            <AppText variant="label" color={available ? 'textPrimary' : 'textMuted'} style={styles.title}>
              {freeBoostTitle(quota.remaining)}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={2}>
              {freeBoostSubtitle(quota)}
            </AppText>
          </Stack>
          {applying ? (
            <ActivityIndicator size="small" color={colors.tierGold} />
          ) : available ? (
            <View style={styles.applyPill}>
              <AppText variant="caption" style={[styles.applyText, { color: colors.tierGold }]}>
                تطبيق
              </AppText>
            </View>
          ) : null}
        </Row>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    cardAvailable: {
      borderColor: colors.tierGold,
      backgroundColor: colors.tierGoldSoft,
    },
    cardUsed: {
      borderColor: colors.borderMid,
      backgroundColor: colors.bgSurface,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    iconWrapAvailable: {
      backgroundColor: colors.bgSurface,
    },
    text: { flex: 1, minWidth: 0 },
    title: { fontWeight: '600' },
    applyPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.tierGold,
    },
    applyText: { fontWeight: '600' },
  });
}
