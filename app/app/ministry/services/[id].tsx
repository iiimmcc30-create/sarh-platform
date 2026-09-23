import { AppText, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { rtlForwardIcon } from '@/lib/rtl';
import {
  OFFICIAL_SERVICE_CATEGORY_META,
  fetchOfficialService,
  fetchOfficialServices,
  resolveServiceChannel,
  resolveServiceFeeLabel,
  splitServiceLines,
  type OfficialService,
} from '@/services/officialServices';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type DetailTab = 'steps' | 'conditions' | 'documents';

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'steps', label: 'الخطوات' },
  { key: 'conditions', label: 'الشروط' },
  { key: 'documents', label: 'المستندات المطلوبة' },
];

export default function MinistryServiceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const [service, setService] = useState<OfficialService | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>('steps');

  const load = useCallback(async () => {
    if (!id) {
      setService(null);
      return;
    }
    const direct = await fetchOfficialService(id);
    if (direct) {
      setService(direct);
      return;
    }
    const { services } = await fetchOfficialServices();
    setService(services.find((item) => item.id === id) ?? null);
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const categoryLabel = useMemo(() => {
    if (!service) return '';
    return OFFICIAL_SERVICE_CATEGORY_META[service.category]?.label ?? service.category;
  }, [service]);

  const channel = service ? resolveServiceChannel(service) : null;
  const feeLabel = service ? resolveServiceFeeLabel(service) : null;
  const tabLines = service
    ? splitServiceLines(
        tab === 'steps' ? service.steps : tab === 'conditions' ? service.conditions : service.documents,
      )
    : [];

  const startService = () => {
    const url = service?.externalUrl?.trim();
    if (!url) return;
    void Linking.openURL(url);
  };

  const tabBody =
    tabLines.length > 0 ? tabLines.join('\n') : 'لا توجد بيانات لهذه الخانة في النظام حالياً.';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="تفاصيل الخدمة" showBack />
      {loading ? (
        <ScreenBody scroll={false}>
          <ActivityIndicator color={colors.electricBright} style={styles.loader} />
        </ScreenBody>
      ) : !service ? (
        <ScreenBody scroll={false}>
          <Stack fill align="center" style={styles.empty}>
            <AppText variant="body" color="textMuted" align="center">
              تعذّر العثور على الخدمة
            </AppText>
          </Stack>
        </ScreenBody>
      ) : (
        <ScreenBody padBottom="xxxl" gap="md">
          <View style={styles.heroCard}>
            <AppText variant="heading2">{service.title}</AppText>
            {categoryLabel ? (
              <Row style={styles.catBadge}>
                <AppText variant="caption" color="primary">
                  {categoryLabel}
                </AppText>
              </Row>
            ) : null}
            {service.description ? (
              <AppText variant="bodySmall" color="textMuted">
                {service.description}
              </AppText>
            ) : null}
            {service.externalUrl ? (
              <SarhButton
                title="بدء الخدمة"
                fullWidth
                accessibilityLabel="بدء الخدمة"
                rightIcon={rtlForwardIcon()}
                onPress={startService}
                style={styles.startCta}
              />
            ) : null}
          </View>

          <View style={styles.metaCard}>
            {feeLabel ? <MetaRow label="رسوم الخدمة" value={feeLabel} /> : null}
            {channel ? <MetaRow label="قناة تقديم الخدمة" value={channel} /> : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabStrip}
          >
            {DETAIL_TABS.map((item) => {
              const active = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={styles.tabChip}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <AppText variant="caption" color={active ? 'primary' : 'textMuted'}>
                    {item.label}
                  </AppText>
                  {active ? <View style={styles.tabLine} /> : <View style={styles.tabLineOff} />}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.tabCard}>
            <AppText variant="bodySmall" color="textMuted">
              {tabBody}
            </AppText>
          </View>
        </ScreenBody>
      )}
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="xs">
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </Stack>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: spacing.xxl },
    empty: { justifyContent: 'center' },
    heroCard: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    catBadge: {
      alignSelf: 'flex-start',
      backgroundColor: `${colors.electric}1F`,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    startCta: {
      marginTop: spacing.sm,
    },
    metaCard: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    tabStrip: {
      gap: spacing.lg,
      paddingHorizontal: 2,
    },
    tabChip: {
      alignItems: 'center',
      paddingTop: 4,
    },
    tabLine: {
      marginTop: 8,
      height: 2,
      width: '80%',
      backgroundColor: colors.electric,
      borderRadius: 2,
    },
    tabLineOff: {
      marginTop: 8,
      height: 2,
    },
    tabCard: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
  });
}
