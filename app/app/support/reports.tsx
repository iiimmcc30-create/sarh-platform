import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { rtlForwardIcon } from '@/lib/rtl';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { REPORT_STATE_LABEL_AR, reportKindLabelAr, reportStateFor, type ReportState } from '@/lib/myReports';
import { fetchMyReports, type UserReportSummary } from '@/services/support';
import { motion } from '@/design-system';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';

/**
 * «بلاغاتي» — the signed-in user's own reports (content reports + fraud tickets).
 * iOS-style grouped list; a row opens the existing ticket thread.
 */
export default function MyReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [items, setItems] = useState<UserReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const page = useRef(1);
  const totalPages = useRef(1);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    const data = await fetchMyReports(1).catch(() => null);
    if (data) {
      setItems(data.items);
      page.current = 1;
      totalPages.current = data.totalPages;
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || page.current >= totalPages.current) return;
    loadingMore.current = true;
    const next = page.current + 1;
    const data = await fetchMyReports(next).catch(() => null);
    if (data) {
      page.current = next;
      totalPages.current = data.totalPages;
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.items.filter((r) => !seen.has(r.id))];
      });
    }
    loadingMore.current = false;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const renderPill = (state: ReportState) => (
    <View style={[styles.pill, state === 'open' ? styles.pillOpen : styles.pillMuted]}>
      <AppText variant="caption" color={state === 'closed' ? 'textMuted' : state === 'open' ? 'textPrimary' : 'textSecondary'}>
        {REPORT_STATE_LABEL_AR[state]}
      </AppText>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="بلاغاتي" showBack />
      <ScreenBody scroll={false} padTop="lg" gap="lg">
        {loading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : items.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.empty}>
            <AppIcon name="flag-outline" size={32} color={colors.textMuted} />
            <AppText variant="cardTitle" color="textPrimary">
              {failed ? 'تعذّر تحميل بلاغاتك' : 'ما عندك بلاغات'}
            </AppText>
            <AppText variant="caption" color="textMuted" align="center">
              {failed
                ? 'تحقق من الاتصال وحاول مرة ثانية.'
                : 'إذا بلّغت عن إعلان أو حساب أو احتيال، تتابع حالته من هنا.'}
            </AppText>
            {failed ? (
              <SarhButton title="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
            ) : null}
          </Stack>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textMuted} />
            }
            renderItem={({ item, index }) => {
              const first = index === 0;
              const last = index === items.length - 1;
              return (
                <View style={[styles.group, first && styles.groupFirst, last && styles.groupLast]}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/support/tickets/[id]', params: { id: item.id } } as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${reportKindLabelAr(item.kind, item.targetType)}: ${item.reason}، ${REPORT_STATE_LABEL_AR[reportStateFor(item.status)]}`}
                    style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
                  >
                    <Row gap="md" align="center" style={styles.row}>
                      <Stack gap="xs" style={styles.fill}>
                        <AppText variant="bodyMedium" color="textPrimary" numberOfLines={1}>
                          {item.reason}
                        </AppText>
                        <AppText variant="caption" color="textMuted" numberOfLines={1}>
                          {reportKindLabelAr(item.kind, item.targetType)} · {formatRelativeTimeAr(item.createdAt)}
                        </AppText>
                      </Stack>
                      {renderPill(reportStateFor(item.status))}
                      <AppIcon name={rtlForwardIcon()} size={14} color={colors.textMuted} />
                    </Row>
                  </Pressable>
                  {!last ? <SarhDivider inset /> : null}
                </View>
              );
            }}
          />
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, minWidth: 0 },
    center: { paddingVertical: spacing.xxl, alignItems: 'center' },
    empty: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    list: { paddingBottom: spacing.huge },
    group: {
      backgroundColor: colors.bgSurface,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    groupFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    groupLast: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
    },
    row: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 60,
    },
    pill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      flexShrink: 0,
    },
    pillOpen: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.textPrimary,
    },
    pillMuted: {
      backgroundColor: colors.bgElevated,
    },
  });
}
