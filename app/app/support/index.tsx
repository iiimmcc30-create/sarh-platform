import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FaqAnswerList } from '@/components/support/FaqAnswerList';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing } from '@/constants/theme';
import { SUPPORT_CUSTOMER_SERVICE } from '@/constants/supportIdentity';
import { motion } from '@/design-system';
import {
  AppText,
  SarhAvatar,
  SarhButton,
  SarhInput,
  SarhSettingsRow,
  SarhSettingsSection,
} from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';
import {
  HELP_CATEGORY_ICON,
  HELP_CATEGORY_ORDER,
  HELP_SEARCH_DEBOUNCE_MS,
  HELP_TOP_QUESTIONS_LIMIT,
  isHelpSearchReady,
} from '@/lib/helpCenter';
import {
  FAQ_CATEGORY_LABEL_AR,
  SERVICE_STATUS_DEFAULT,
  fetchFaqs,
  fetchServiceStatus,
  type FaqItem,
  type ServiceStatus,
} from '@/services/support';

/**
 * Help center hub — one screen for every entry point (More tab, sidebar, settings).
 * Order: status → search → categories → top questions → fraud → «اسأل مساعد سرح»
 * → تذاكري → create ticket (last). A "my reports" row is hidden: there is no my-reports endpoint.
 */
export default function SupportHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [status, setStatus] = useState<ServiceStatus>(SERVICE_STATUS_DEFAULT);
  const [topFaqs, setTopFaqs] = useState<FaqItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FaqItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void fetchServiceStatus().then((s) => {
        if (alive) setStatus(s);
      });
      void fetchFaqs({ top: HELP_TOP_QUESTIONS_LIMIT }).then((data) => {
        if (alive && data) setTopFaqs(data.faqs ?? []);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  useEffect(() => {
    const q = query.trim();
    if (!isHelpSearchReady(q)) {
      searchSeq.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void fetchFaqs({ search: q }).then((data) => {
        if (seq !== searchSeq.current) return;
        setResults((data?.faqs ?? []).slice(0, 8));
        setSearching(false);
      });
    }, HELP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searchActive = isHelpSearchReady(query);
  const degraded = status.state === 'degraded';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="مركز المساعدة" showBack />
      <ScreenBody gutter={false} padTop="md" padBottom="xxxl">
        {/* 1. Service status */}
        <View style={styles.gutter}>
          <View
            style={[styles.statusRow, getRtlRow(), { borderColor: colors.borderHairline }]}
            accessible
            accessibilityLabel={`حالة الخدمة: ${status.textAr}`}
          >
            <View
              style={[styles.statusDot, { backgroundColor: degraded ? colors.warning : colors.success }]}
            />
            <AppText variant="caption" color={degraded ? 'textPrimary' : 'textSecondary'} style={styles.fill}>
              {status.textAr}
            </AppText>
          </View>
        </View>

        {/* 2. Search */}
        <View style={[styles.gutter, styles.searchWrap]}>
          <SarhInput
            appearance="theme"
            icon="search-outline"
            value={query}
            onChangeText={setQuery}
            placeholder="اكتب سؤالك… مثلاً: الرمز ما وصلني"
            returnKeyType="search"
            accessibilityLabel="ابحث في مركز المساعدة"
          />
        </View>

        {searchActive ? (
          <View style={styles.gutter}>
            {searching && results.length === 0 ? (
              <View style={styles.searchState}>
                <ActivityIndicator color={colors.textMuted} />
              </View>
            ) : results.length === 0 ? (
              <Stack gap="sm" style={styles.searchState}>
                <AppText variant="body" color="textMuted" align="center">
                  ما لقينا جواب مطابق
                </AppText>
                <SarhButton
                  title="اسأل مساعد سرح"
                  variant="secondary"
                  size="sm"
                  onPress={() => router.push('/support/help' as never)}
                />
              </Stack>
            ) : (
              <FaqAnswerList faqs={results} />
            )}
          </View>
        ) : (
          <>
            {/* 3. Categories */}
            <SarhSettingsSection title="التصنيفات">
              {HELP_CATEGORY_ORDER.map((cat, i) => (
                <SarhSettingsRow
                  key={cat}
                  icon={HELP_CATEGORY_ICON[cat]}
                  title={FAQ_CATEGORY_LABEL_AR[cat]}
                  showDivider={i < HELP_CATEGORY_ORDER.length - 1}
                  onPress={() =>
                    router.push({ pathname: '/support/faq', params: { category: cat } } as never)
                  }
                />
              ))}
            </SarhSettingsSection>

            {/* 4. Top questions */}
            {topFaqs.length > 0 ? (
              <View style={styles.gutter}>
                <AppText variant="caption" color="textMuted" style={styles.sectionTitle}>
                  الأكثر سؤالاً
                </AppText>
                <FaqAnswerList faqs={topFaqs} />
              </View>
            ) : null}
          </>
        )}

        {/* 5. Fraud — prominent */}
        <View style={[styles.gutter, styles.block]}>
          <Pressable
            onPress={() => router.push('/support/fraud' as never)}
            accessibilityRole="button"
            accessibilityLabel="بلّغ عن احتيال"
            style={({ pressed }) => [
              styles.card,
              { borderColor: colors.danger, opacity: pressed ? motion.press.opacity : 1 },
            ]}
          >
            <Row gap="md" align="center">
              <AppIcon name="warning-outline" size={24} color={colors.danger} />
              <Stack gap="xs" style={styles.fill}>
                <AppText variant="cardTitle" color="danger">
                  بلّغ عن احتيال
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  أحد طلب منك عربون أو رمز تحقق؟ بلّغنا وحنا نتابع بأولوية.
                </AppText>
              </Stack>
            </Row>
          </Pressable>
        </View>

        {/* 6. Ask the assistant */}
        <View style={[styles.gutter, styles.block]}>
          <Pressable
            onPress={() => router.push('/support/help' as never)}
            accessibilityRole="button"
            accessibilityLabel="اسأل مساعد سرح"
            style={({ pressed }) => [
              styles.card,
              { borderColor: colors.borderHairline, opacity: pressed ? motion.press.opacity : 1 },
            ]}
          >
            <Row gap="md" align="center">
              <SarhAvatar
                source={SUPPORT_CUSTOMER_SERVICE.avatarSource}
                name={SUPPORT_CUSTOMER_SERVICE.assistantName}
                size="md"
                accessibilityLabel={SUPPORT_CUSTOMER_SERVICE.assistantName}
              />
              <Stack gap="xs" style={styles.fill}>
                <AppText variant="cardTitle">اسأل مساعد سرح</AppText>
                <AppText variant="caption" color="textSecondary">
                  جواب سريع، ولو احتجت موظف يحوّلك له مباشرة.
                </AppText>
              </Stack>
              <AppIcon name={rtlForwardIcon()} size={18} color={colors.textMuted} />
            </Row>
          </Pressable>
        </View>

        {/* 7. My tickets (a "my reports" row stays hidden until a my-reports endpoint exists) */}
        <SarhSettingsSection title="طلباتي">
          <SarhSettingsRow
            icon="ticket-outline"
            title="تذاكري"
            showDivider={false}
            onPress={() => router.push('/support/tickets' as never)}
          />
        </SarhSettingsSection>

        {/* 8. Create ticket — last */}
        <View style={[styles.gutter, styles.block]}>
          <SarhButton
            title="إنشاء تذكرة"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/support/tickets/create' as never)}
          />
        </View>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: spacing.lg },
  fill: { flex: 1, minWidth: 0 },
  statusRow: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  searchWrap: { paddingTop: spacing.md },
  searchState: { paddingVertical: spacing.xl, alignItems: 'center' },
  sectionTitle: { paddingTop: spacing.xl, paddingBottom: spacing.xs },
  block: { paddingTop: spacing.lg },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
