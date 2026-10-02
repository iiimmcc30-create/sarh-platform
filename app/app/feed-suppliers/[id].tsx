import { FeedSupplierContactActions } from '@/components/feed-suppliers/FeedSupplierContactActions';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { buttonMetrics, space, typography as ds } from '@/design-system';
import { AVATAR_SIZE, AppText, SarhAvatar } from '@/design-system/components';
import {
  SkeletonBox,
  SkeletonCircle,
  SkeletonPulse,
  SkeletonRegion,
  SkeletonText,
} from '@/components/ui/skeleton';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { supplierPlace } from '@/lib/feedSuppliers';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { showToast } from '@/lib/toast';
import { fetchFeedSupplier, type FeedSupplier } from '@/services/feedSuppliers';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

/** Labeled contact buttons (call / WhatsApp / mail) while the supplier loads. */
const CONTACT_SKELETON_WIDTHS = [84, 104, 80] as const;

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
        <ScreenBody scroll={false} padTop="md" gap="section">
          <SkeletonRegion style={styles.skeletonColumn}>
            <SkeletonPulse>
              <Row gap="md" align="center">
                <SkeletonCircle size={AVATAR_SIZE.xl} />
                <Stack gap="xs" style={styles.identity}>
                  <SkeletonText fontSize={ds.heading3.fontSize} lineHeight={ds.heading3.lineHeight} widths={['62%']} />
                  <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['40%']} />
                </Stack>
              </Row>
            </SkeletonPulse>
            <SkeletonPulse>
              <SkeletonText
                fontSize={ds.bodySmall.fontSize}
                lineHeight={ds.bodySmall.lineHeight}
                lines={3}
                widths={['100%', '94%', '60%']}
              />
            </SkeletonPulse>
            <SkeletonPulse style={styles.skeletonCaptions}>
              <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['56%']} />
              <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['44%']} />
              <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['32%']} />
            </SkeletonPulse>
            <Section title="تواصل">
              <SkeletonPulse>
                <Row gap="sm" wrap>
                  {CONTACT_SKELETON_WIDTHS.map((width, i) => (
                    <SkeletonBox
                      key={i}
                      width={width}
                      height={buttonMetrics.size.sm.minHeight}
                      radius={buttonMetrics.radius}
                    />
                  ))}
                </Row>
              </SkeletonPulse>
            </Section>
          </SkeletonRegion>
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
  skeletonColumn: { gap: space[24] },
  skeletonCaptions: { gap: space[24] },
  identity: { flex: 1, minWidth: 0 },
  name: { flexShrink: 1, minWidth: 0 },
});
