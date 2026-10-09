// «تمييز مجاني (متبقي X)» — first option in the boost sheets for Blue+/Gold.
// Fetches its own quota; renders nothing for users without the perk (or while
// the featured service is switched off). Applying never touches payments.
// `appearance="prominent"` is the boost-screen hero row («استخدم تعزيز مجاني»);
// `onQuota` lets a host show its own upsell when the user has no perk.
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { freeBoostCtaTitle } from '@/lib/promotePage';
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
  /** Called once the quota request settles (null = request failed). */
  onQuota?: (quota: FreeBoostQuota | null) => void;
  /** `prominent`: high-contrast boost-screen row. Default keeps the sheet look. */
  appearance?: 'default' | 'prominent';
  style?: StyleProp<ViewStyle>;
};

export function FreeBoostOption({
  listingId,
  enabled = true,
  onApplied,
  onQuota,
  appearance = 'default',
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [quota, setQuota] = useState<FreeBoostQuota | null>(null);
  const [applying, setApplying] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const onQuotaRef = useRef(onQuota);
  onQuotaRef.current = onQuota;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchFreeBoostQuota().then((q) => {
      if (!alive) return;
      setQuota(q);
      onQuotaRef.current?.(q);
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
  const prominent = appearance === 'prominent';
  const title = prominent ? freeBoostCtaTitle(quota.remaining) : freeBoostTitle(quota.remaining);

  return (
    <Animated.View style={[{ opacity: fade, transform: [{ scale }] }, style]}>
      <Pressable
        onPress={() => void apply()}
        disabled={!available || applying}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
        accessibilityRole="button"
        accessibilityState={{ disabled: !available || applying }}
        accessibilityLabel={title}
        style={[
          styles.card,
          available ? (prominent ? styles.cardProminent : styles.cardAvailable) : styles.cardUsed,
        ]}
        testID="free-boost-option"
      >
        <Row gap="md" align="center">
          <View style={[styles.iconWrap, available ? styles.iconWrapAvailable : null]}>
            <AppIcon name="star-outline" size={18} color={available ? colors.tierGold : colors.textMuted} />
          </View>
          <Stack gap="xs" style={styles.text}>
            <AppText variant="label" color={available ? 'textPrimary' : 'textMuted'} style={styles.title}>
              {title}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={2}>
              {freeBoostSubtitle(quota)}
            </AppText>
          </Stack>
          {applying ? (
            <ActivityIndicator size="small" color={prominent ? colors.textPrimary : colors.tierGold} />
          ) : available && prominent ? (
            <View style={styles.applyPillSolid}>
              <AppText variant="caption" style={[styles.applyText, { color: colors.screenRoot }]}>
                استخدم
              </AppText>
            </View>
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
    cardProminent: {
      borderWidth: 1.5,
      borderColor: colors.textPrimary,
      backgroundColor: colors.bgSurface,
      minHeight: 64,
      justifyContent: 'center',
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
    applyPillSolid: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.textPrimary,
    },
    applyText: { fontWeight: '600' },
  });
}
