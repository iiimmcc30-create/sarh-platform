import { FeedSupplierContactActions } from '@/components/feed-suppliers/FeedSupplierContactActions';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Image } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { colors, functional, motion, radius, space } from '@/design-system';
import { AppText, SarhAvatar, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { supplierPlace } from '@/lib/feedSuppliers';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import { fetchFeedSuppliers, type FeedSupplier } from '@/services/feedSuppliers';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

const HERO_IMAGE = require('../../assets/images/feed-suppliers-hero.jpg');
const HERO_ASPECT = 1408 / 768;

export default function FeedSuppliersScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const styles = useThemedStyles(() => createStyles());
  const [suppliers, setSuppliers] = useState<FeedSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const hasDataRef = useRef(false);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) setRefreshing(true);
    else if (!hasDataRef.current) setLoading(true);
    try {
      const rows = await fetchFeedSuppliers();
      setSuppliers(rows);
      hasDataRef.current = true;
      setHasData(true);
    } catch {
      showToast('تعذر تحميل الموردين', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={['top']}>
      <ScreenHeader variant="screen" title="موردو الأعلاف" showBack />
      <ScreenBody
        padTop="md"
        padBottom="xxxl"
        gap="section"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />
        }
      >
        <View style={styles.hero} accessibilityRole="image" accessibilityLabel="موردو الأعلاف">
          <Image source={HERO_IMAGE} style={styles.heroImage} contentFit="cover" />
          <LinearGradient
            colors={['transparent', themeColors.bgOverlay]}
            locations={[0.4, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroOverlay}
          />
          <View style={styles.heroCopy}>
            <AppText variant="heading2" style={styles.heroTitle}>
              موردو الأعلاف
            </AppText>
            <AppText variant="bodySmall" style={styles.heroSubtitle}>
              تعرّف على موردي الأعلاف في سرح
            </AppText>
          </View>
        </View>

        <Section title="الموردون">
          {loading && !hasData ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : suppliers.length === 0 ? (
            <AppText variant="bodySmall" color="textMuted" align="center">
              لا يوجد موردون متاحون حالياً
            </AppText>
          ) : (
            suppliers.map((supplier, index) => {
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
                        size="lg"
                      />
                      <View style={styles.copy}>
                        <Row gap="xs" align="center">
                          <AppText variant="label" numberOfLines={1} style={styles.name}>
                            {supplier.nameAr}
                          </AppText>
                          {supplier.verified ? <VerificationBadge size={16} /> : null}
                        </Row>
                        {supplier.description ? (
                          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                            {supplier.description}
                          </AppText>
                        ) : null}
                        {place ? (
                          <AppText variant="caption" color="textMuted" numberOfLines={1}>
                            {place}
                          </AppText>
                        ) : null}
                        <FeedSupplierContactActions supplier={supplier} />
                      </View>
                    </Row>
                  </Pressable>
                </View>
              );
            })
          )}
        </Section>
      </ScreenBody>
    </Screen>
  );
}

function createStyles() {
  return StyleSheet.create({
    hero: {
      width: '100%',
      aspectRatio: HERO_ASPECT,
      borderRadius: radius[16],
      overflow: 'hidden',
      backgroundColor: colors.surfaceElevated,
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
    },
    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    heroCopy: {
      position: 'absolute',
      start: space[16],
      end: space[16],
      bottom: space[16],
      gap: space[4],
    },
    heroTitle: {
      color: functional.onPrimary,
    },
    heroSubtitle: {
      color: functional.onPrimary,
      opacity: 0.88,
    },
    loader: { marginTop: space[24] },
    row: {
      paddingVertical: space[12],
    },
    pressed: { opacity: motion.opacity.pressed },
    copy: { flex: 1, minWidth: 0, gap: space[4] },
    name: { flexShrink: 1, minWidth: 0 },
  });
}
