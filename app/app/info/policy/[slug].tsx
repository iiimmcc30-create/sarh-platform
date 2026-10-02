import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { getPolicyBySlug, POLICY_LAST_UPDATED_PLACEHOLDER } from '@/constants/sarhPolicies';
import { fetchPublicPolicy } from '@/services/content';
import { spacing } from '@/constants/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, type DimensionValue } from 'react-native';
import { typography as ds } from '@/design-system';
import { SkeletonPulse, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { AppText, SarhDivider } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';

/** Lines per placeholder clause (title + prose), like a short policy page. */
const POLICY_SKELETON_SECTIONS = [4, 3, 4] as const;
const POLICY_LINE_WIDTHS: DimensionValue[] = ['100%', '96%', '92%', '64%'];

export default function PolicyDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const fallback = slug ? getPolicyBySlug(String(slug)) : undefined;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(fallback?.titleAr ?? 'السياسة');
  const [sections, setSections] = useState(fallback?.sections ?? []);
  const [updatedLabel, setUpdatedLabel] = useState(
    fallback?.lastUpdatedLabel ?? POLICY_LAST_UPDATED_PLACEHOLDER,
  );

  useEffect(() => {
    let alive = true;
    if (!slug) {
      setLoading(false);
      return;
    }
    void fetchPublicPolicy(String(slug)).then((doc) => {
      if (!alive || !doc) {
        setLoading(false);
        return;
      }
      setTitle(doc.titleAr);
      setSections(doc.sections);
      setUpdatedLabel(doc.lastUpdatedLabel);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={title} showBack />

      {/* Bundled policy text renders at once; the skeleton only covers slugs without a local copy. */}
      {loading && sections.length === 0 ? (
        <ScreenBody scroll={false} padTop="lg" gap="section">
          <SkeletonRegion style={styles.skeletonColumn}>
            {POLICY_SKELETON_SECTIONS.map((lines, i) => (
              <SkeletonPulse key={i} style={styles.skeletonSection}>
                <SkeletonText fontSize={ds.heading3.fontSize} lineHeight={ds.heading3.lineHeight} widths={['46%']} />
                <SkeletonText
                  fontSize={ds.body.fontSize}
                  lineHeight={24}
                  lines={lines}
                  widths={POLICY_LINE_WIDTHS.slice(4 - lines)}
                />
              </SkeletonPulse>
            ))}
          </SkeletonRegion>
        </ScreenBody>
      ) : (
        <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
          {sections.map((section, i) => (
            <Stack key={`${section.title}-${i}`} gap="sm">
              {section.title ? (
                <AppText variant="cardTitle" color="textPrimary">{section.title}</AppText>
              ) : null}
              <AppText variant="body" color="textSecondary" style={styles.prose}>
                {section.body}
              </AppText>
              {i < sections.length - 1 ? <SarhDivider style={styles.clauseRule} /> : null}
            </Stack>
          ))}
          <AppText variant="meta" color="textMuted" align="center">
            آخر تحديث: {updatedLabel}
          </AppText>
        </ScreenBody>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletonColumn: { gap: spacing.xxl },
  skeletonSection: { gap: spacing.sm },
  prose: { lineHeight: 24 },
  clauseRule: { marginTop: spacing.md },
});
