import { SkeletonBox, SkeletonPulse, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FaqAnswerList } from '@/components/support/FaqAnswerList';
import { spacing } from '@/constants/theme';
import { typography as dsType } from '@/design-system';
import { AppText, SarhButton, SarhChip, SarhChipRow, SarhDivider, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { HELP_SEARCH_DEBOUNCE_MS, isFaqCategory } from '@/lib/helpCenter';
import { fetchFaqs, FAQ_CATEGORY_LABEL_AR, type FaqItem } from '@/services/support';

export default function SupportFaqScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const initialCategory = isFaqCategory(params.category) ? params.category : undefined;
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<{ value: string; labelAr: string }[]>([]);
  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [debounced, setDebounced] = useState(search);
  const [category, setCategory] = useState<string | undefined>(initialCategory);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), HELP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const data = await fetchFaqs({ search: debounced.trim() || undefined, category });
    if (mine !== seq.current) return;
    if (data) {
      setFaqs(data.faqs ?? []);
      setCategories(data.categories ?? []);
    }
    setLoading(false);
  }, [debounced, category]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const categoryChips = useMemo(
    () => [{ value: '', labelAr: 'الكل' }, ...categories],
    [categories],
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={category && isFaqCategory(category) ? FAQ_CATEGORY_LABEL_AR[category] : 'الأسئلة الشائعة'} showBack />
      <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
        <Stack gap="md">
          <SarhInput
            appearance="theme"
            label="بحث"
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن سؤال..."
            onSubmitEditing={() => setDebounced(search)}
          />
          <SarhChipRow contentPaddingHorizontal={0}>
            {categoryChips.map((cat) => (
              <SarhChip
                appearance="filter"
                key={cat.value || 'all'}
                label={cat.labelAr}
                selected={(category ?? '') === cat.value}
                onPress={() => setCategory(cat.value || undefined)}
              />
            ))}
          </SarhChipRow>
        </Stack>

        {loading && faqs.length === 0 ? (
          // First load: collapsed FAQ rows (category meta, question, chevron, divider).
          <SkeletonRegion>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i}>
                <SkeletonPulse style={styles.faqRow}>
                  <Row gap="md" align="start">
                    <Stack gap="xs" style={styles.fill}>
                      <SkeletonText fontSize={dsType.micro.fontSize} lineHeight={dsType.micro.lineHeight} widths={['22%']} />
                      <SkeletonText
                        fontSize={dsType.heading3.fontSize}
                        lineHeight={dsType.heading3.lineHeight}
                        widths={[i % 2 ? '62%' : '84%']}
                      />
                    </Stack>
                    <SkeletonBox width={18} height={18} radius={9} />
                  </Row>
                </SkeletonPulse>
                {i < 5 ? <SarhDivider /> : null}
              </View>
            ))}
          </SkeletonRegion>
        ) : faqs.length === 0 ? (
          <AppText variant="body" color="textMuted" align="center">
            ما لقينا سؤال مطابق
          </AppText>
        ) : (
          <FaqAnswerList faqs={faqs} showCategory={!category} />
        )}

        <Section title="ما لقيت جوابك؟" gap="md">
          <SarhButton
            title="اسأل مساعد سرح"
            fullWidth
            onPress={() => router.push('/support/help' as never)}
          />
          <SarhButton
            title="إنشاء تذكرة"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/support/tickets/create' as never)}
          />
        </Section>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  faqRow: { paddingVertical: spacing.lg },
});
