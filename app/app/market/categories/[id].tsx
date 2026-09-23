import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { AppText } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';

import { rtlForwardIcon } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import {
  fetchMarketCategory,
  fetchMarketSubcategories,
  type MarketCategory,
} from '@/services/categories';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';

export default function MarketSubcategoriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));

  const [parent, setParent] = useState<MarketCategory | null>(null);
  const [subs, setSubs] = useState<MarketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [cat, children] = await Promise.all([
        fetchMarketCategory(id),
        fetchMarketSubcategories(id),
      ]);
      if (!cat) {
        setError('التصنيف غير موجود');
        setParent(null);
        setSubs([]);
        return;
      }
      setParent(cat);
      setSubs(children);
    } catch {
      setError('تعذّر تحميل التصنيفات');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelectSub = (sub: MarketCategory) => {
    if (!parent) return;
    safePush(
      {
        pathname: '/market/browse',
        params: {
          categoryId: parent.id,
          subcategoryId: sub.id,
          parentName: parent.nameAr,
          parentEmoji: parent.emoji ?? '',
          subName: sub.nameAr,
          subEmoji: sub.emoji ?? '',
        },
      },
      undefined,
      router,
    );
  };

  const headerTitle = parent
    ? `${parent.emoji ? `${parent.emoji} ` : ''}${parent.nameAr}`
    : 'التصنيف';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" showBack title={headerTitle} />

      {loading ? (
        <ScreenBody scroll={false}>
          <Stack fill align="center" style={styles.center}>
            <ActivityIndicator color={colors.electric} />
          </Stack>
        </ScreenBody>
      ) : error ? (
        <ScreenBody scroll={false}>
          <Stack fill gap="md" align="center" style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              {error}
            </AppText>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <AppText variant="caption" color="textPrimary">
                إعادة المحاولة
              </AppText>
            </Pressable>
          </Stack>
        </ScreenBody>
      ) : (
        <ScreenBody padBottom="xxxl" gap="md">
          <AppText variant="body" color="textMuted">
            اختر النوع
          </AppText>
          <Stack gap="sm">
            {subs.map((sub) => (
              <Pressable
                key={sub.id}
                onPress={() => onSelectSub(sub)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Row justify="end" gap="sm">
                  <AppIcon name={rtlForwardIcon()} size={16} color={colors.textMuted} />
                  <AppText variant="label" color="textPrimary" numberOfLines={1} style={styles.rowLabel}>
                    {sub.emoji ? `${sub.emoji} ` : ''}
                    {sub.nameAr}
                  </AppText>
                </Row>
              </Pressable>
            ))}
          </Stack>
        </ScreenBody>
      )}
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.bgElevated,
      borderRadius: 14,
      overflow: 'hidden',
    },
    rowPressed: {
      opacity: motion.press.opacity,
    },
    rowLabel: {
      flex: 1,
      minWidth: 0,
    },
    center: {
      justifyContent: 'center',
      padding: spacing.xl,
    },
    retryBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
    },
  });
}
