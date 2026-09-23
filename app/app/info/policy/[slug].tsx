import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { getPolicyBySlug, POLICY_LAST_UPDATED_PLACEHOLDER } from '@/constants/sarhPolicies';
import { fetchPublicPolicy } from '@/services/content';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { AppText, SarhDivider } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';

export default function PolicyDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
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

      {loading ? (
        <ScreenBody scroll={false} style={styles.loading}>
          <ActivityIndicator color={colors.electricBright} />
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
  loading: { alignItems: 'center', justifyContent: 'center' },
  prose: { lineHeight: 24 },
  clauseRule: { marginTop: spacing.md },
});
