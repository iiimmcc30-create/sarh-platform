import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { motion, radius, space } from '@/design-system';
import { AppText, SarhAvatar, SarhDivider } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { ThemeColors } from '@/constants/theme';
import { HOME_FEED_SUPPLIERS_PREVIEW_LIMIT } from '@/lib/homeQuickAccess';
import { supplierPlace } from '@/lib/feedSuppliers';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { safePush } from '@/lib/safeNavigate';
import { fetchFeedSuppliers, type FeedSupplier } from '@/services/feedSuppliers';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const HOME_SUPPLIERS_TTL_MS = 60_000;

export function HomeFeedSuppliers() {
  const router = useRouter();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const [suppliers, setSuppliers] = useState<FeedSupplier[]>([]);
  const lastAt = useRef(0);
  const inflightRef = useRef(false);

  const load = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastAt.current < HOME_SUPPLIERS_TTL_MS && lastAt.current > 0) {
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const rows = await fetchFeedSuppliers();
      setSuppliers(rows.slice(0, HOME_FEED_SUPPLIERS_PREVIEW_LIMIT));
      lastAt.current = Date.now();
    } catch {
      /* keep last good preview */
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (suppliers.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Row
        align="center"
        justify="between"
        style={[styles.sectionHead, { paddingHorizontal: gutter }]}
      >
        <AppText variant="heading2" color="textPrimary" style={styles.sectionTitle} numberOfLines={1}>
          موردين الأعلاف
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="عرض كل الموردين"
          onPress={() => safePush('/feed-suppliers', undefined, router)}
          hitSlop={8}
          style={styles.seeAllBtn}
        >
          <AppText variant="caption" color="primary" numberOfLines={1}>
            عرض الكل
          </AppText>
        </Pressable>
      </Row>
      <View style={[styles.card, { marginHorizontal: gutter }]}>
        {suppliers.map((supplier, index) => {
          const place = supplierPlace(supplier);
          return (
            <View key={supplier.id}>
              {index > 0 ? <SarhDivider /> : null}
              <Pressable
                onPress={() =>
                  safePush(
                    { pathname: '/feed-suppliers/[id]', params: { id: supplier.id } },
                    undefined,
                    router,
                  )
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={supplier.nameAr}
              >
                <Row gap="md" align="start">
                  <SarhAvatar
                    uri={cloudinaryFitUrl(supplier.logo || supplier.cover, 'row')}
                    name={supplier.nameAr}
                    fallback="أعلاف"
                    size="md"
                  />
                  <View style={styles.copy}>
                    <Row gap="xs" align="center">
                      <AppText variant="label" numberOfLines={1} style={styles.name}>
                        {supplier.nameAr}
                      </AppText>
                      {supplier.verified ? <VerificationBadge size={16} /> : null}
                    </Row>
                    {place ? (
                      <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {place}
                      </AppText>
                    ) : null}
                  </View>
                </Row>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingBottom: space[8],
    },
    sectionHead: {
      paddingTop: space[8],
      paddingBottom: space[8],
    },
    sectionTitle: {
      flex: 1,
      minWidth: 0,
    },
    seeAllBtn: {
      flexShrink: 0,
      paddingStart: space[8],
    },
    card: {
      borderRadius: radius[16],
      overflow: 'hidden',
      backgroundColor: theme.bgSurface,
    },
    row: {
      paddingHorizontal: space[12],
      paddingVertical: space[12],
    },
    pressed: { opacity: motion.opacity.pressed },
    copy: { flex: 1, minWidth: 0, gap: space[4] },
    name: { flexShrink: 1, minWidth: 0 },
  });
}

export default HomeFeedSuppliers;
