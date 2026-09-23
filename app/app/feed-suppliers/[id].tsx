import { FeedSupplierContactActions } from '@/components/feed-suppliers/FeedSupplierContactActions';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { colors, space } from '@/design-system';
import { AppText, SarhAvatar } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { supplierPlace } from '@/lib/feedSuppliers';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { showToast } from '@/lib/toast';
import { fetchFeedSupplier, type FeedSupplier } from '@/services/feedSuppliers';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

export default function FeedSupplierDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [supplier, setSupplier] = useState<FeedSupplier | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchFeedSupplier(id);
      setSupplier(data);
    } catch {
      showToast('تعذر تحميل المورد', 'error');
      setSupplier(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader variant="screen" title="موردو الأعلاف" showBack />
        <ScreenBody scroll={false}>
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        </ScreenBody>
      </Screen>
    );
  }

  if (!supplier) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader variant="screen" title="موردو الأعلاف" showBack />
        <ScreenBody>
          <AppText variant="bodySmall" color="textMuted" align="center">
            لا يوجد موردون متاحون حالياً
          </AppText>
        </ScreenBody>
      </Screen>
    );
  }

  const place = supplierPlace(supplier);

  return (
    <Screen edges={['top']}>
      <ScreenHeader variant="screen" title={supplier.nameAr} showBack />
      <ScreenBody padTop="md" padBottom="xxxl" gap="section">
        <Row gap="md" align="center">
          <SarhAvatar
            uri={cloudinaryFitUrl(supplier.logo || supplier.cover, 'row')}
            name={supplier.nameAr}
            fallback="أعلاف"
            size="xl"
          />
          <Stack gap="xs" style={styles.identity}>
            <Row gap="xs" align="center">
              <AppText variant="heading3" numberOfLines={2} style={styles.name}>
                {supplier.nameAr}
              </AppText>
              {supplier.verified ? <VerificationBadge size={18} /> : null}
            </Row>
            {place ? (
              <AppText variant="caption" color="textMuted" numberOfLines={2}>
                {place}
              </AppText>
            ) : null}
          </Stack>
        </Row>

        {supplier.description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {supplier.description}
          </AppText>
        ) : null}

        {supplier.addressAr ? (
          <AppText variant="caption" color="textMuted">
            {supplier.addressAr}
          </AppText>
        ) : null}

        {supplier.hoursAr ? (
          <AppText variant="caption" color="textMuted">
            ساعات العمل: {supplier.hoursAr}
          </AppText>
        ) : null}

        {supplier.phone ? (
          <AppText variant="caption" color="textSecondary">
            {supplier.phone}
          </AppText>
        ) : null}
        {supplier.whatsapp ? (
          <AppText variant="caption" color="textSecondary">
            {supplier.whatsapp}
          </AppText>
        ) : null}
        {supplier.email ? (
          <AppText variant="caption" color="textSecondary">
            {supplier.email}
          </AppText>
        ) : null}
        {supplier.website ? (
          <AppText variant="caption" color="primary">
            {supplier.website}
          </AppText>
        ) : null}

        <Section title="تواصل">
          <FeedSupplierContactActions supplier={supplier} labeled />
        </Section>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: space[32] },
  identity: { flex: 1, minWidth: 0 },
  name: { flexShrink: 1, minWidth: 0 },
});
