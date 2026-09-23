import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing } from '@/constants/theme';
import { motion } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import { AppText, SarhButton, SarhChip, SarhChipRow, SarhDivider, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import {
  fetchFaqs,
  FAQ_CATEGORY_LABEL_AR,
  type FaqCategory,
  type FaqItem,
} from '@/services/support';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SupportFaqScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<{ value: string; labelAr: string }[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchFaqs({ search: search.trim() || undefined, category });
    if (data) {
      setFaqs(data.faqs ?? []);
      setCategories(data.categories ?? []);
    }
    setLoading(false);
  }, [search, category]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(motion.duration.screen, 'easeInEaseOut', 'opacity'),
    );
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const categoryChips = useMemo(
    () => [{ value: '', labelAr: 'الكل' }, ...categories],
    [categories],
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الأسئلة الشائعة" showBack />
      <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
        <Stack gap="md">
          <SarhInput
            appearance="theme"
            label="بحث"
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن سؤال..."
            onSubmitEditing={() => void load()}
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
          <ActivityIndicator />
        ) : faqs.length === 0 ? (
          <AppText variant="body" color="textMuted" align="center">
            لا توجد أسئلة مطابقة
          </AppText>
        ) : (
          <Stack gap="none">
            {faqs.map((faq, i) => {
              const open = expandedId === faq.id;
              return (
                <View key={faq.id}>
                  <Pressable
                    onPress={() => toggle(faq.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={faq.questionAr}
                    style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
                  >
                    <Stack gap="sm" style={styles.faqRow}>
                      <Row gap="md" align="start">
                        <Stack gap="xs" style={styles.fill}>
                          <AppText variant="meta" color="primary">
                            {FAQ_CATEGORY_LABEL_AR[faq.category as FaqCategory] ?? faq.category}
                          </AppText>
                          <AppText variant="cardTitle" color="textPrimary">
                            {faq.questionAr}
                          </AppText>
                        </Stack>
                        <AppIcon
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textMuted}
                        />
                      </Row>
                      {open ? (
                        <AppText variant="body" color="textSecondary">
                          {faq.answerAr}
                        </AppText>
                      ) : null}
                    </Stack>
                  </Pressable>
                  {i < faqs.length - 1 ? <SarhDivider /> : null}
                </View>
              );
            })}
          </Stack>
        )}

        <Section title="لم تجد إجابة لسؤالك؟" gap="md">
          <SarhButton
            title="إنشاء تذكرة دعم"
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
