// «المجالس» — live voice councils: my council, private invitations, public list.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CouncilCard } from '@/components/councils/CouncilCard';
import { CouncilUpcomingCard } from '@/components/councils/CouncilUpcomingCard';
import { CouncilMiniPlayer } from '@/components/councils/CouncilMiniPlayer';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing } from '@/constants/theme';
import { useOptionalCouncilSession } from '@/contexts/CouncilSessionContext';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import {
  COUNCIL_FAB_SIZE,
  COUNCIL_MINI_PLAYER_GAP,
  COUNCIL_MINI_PLAYER_HEIGHT,
  councilFabAnchor,
} from '@/lib/councilSession';
import { isAppRtl } from '@/lib/rtl';
import { sortCouncilsByHostTier } from '@/lib/subscriberTier';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COUNCIL_WEB_TEXT,
  COUNCILS_EMPTY_TEXT,
  COUNCILS_UPCOMING_TITLE,
  CouncilApiError,
  councilErrorMessage,
  fetchAccessibleCouncils,
  fetchCouncils,
  fetchUpcomingCouncils,
  setCouncilReminder,
  startScheduledCouncil,
  type CouncilCard as CouncilCardData,
  type CouncilUpcomingCard as UpcomingData,
} from '@/services/councils';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';

export default function CouncilsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useOptionalCouncilSession();
  const [fabScale] = useState(() => new Animated.Value(1));
  const [mine, setMine] = useState<CouncilCardData | null>(null);
  const [privateList, setPrivateList] = useState<CouncilCardData[]>([]);
  const [publicList, setPublicList] = useState<CouncilCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingData[]>([]);
  const [upcomingBusy, setUpcomingBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const [acc, pub, up] = await Promise.all([
        fetchAccessibleCouncils(),
        fetchCouncils(),
        // «قادمة» is optional: an older backend or a hiccup never blocks the live list.
        fetchUpcomingCouncils().catch(() => null),
      ]);
      if (id !== seq.current) return;
      if (up) setUpcoming(up.councils);
      setMine(acc.mine);
      setPrivateList(acc.private);
      const hidden = new Set([acc.mine?.id, ...acc.private.map((c) => c.id)]);
      setPublicList(pub.councils.filter((c) => !hidden.has(c.id)));
      setCursor(pub.nextCursor);
      setHasMore(pub.hasMore);
      setError(null);
    } catch (err) {
      if (id === seq.current) setError(councilErrorMessage(err));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') void load();
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const pub = await fetchCouncils(cursor);
      setPublicList((list) => {
        const seen = new Set(list.map((c) => c.id));
        return [...list, ...pub.councils.filter((c) => !seen.has(c.id) && c.id !== mine?.id)];
      });
      setCursor(pub.nextCursor);
      setHasMore(pub.hasMore);
    } catch {
      // keep the current page
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, mine?.id]);

  const open = useCallback(
    (c: CouncilCardData) => safePush({ pathname: '/councils/[id]', params: { id: c.id } }, undefined, router),
    [router],
  );

  const toggleRemind = useCallback(async (c: UpcomingData) => {
    const on = !c.remindMe;
    const patch = (remindMe: boolean, reminderCount: number) =>
      setUpcoming((list) => list.map((x) => (x.id === c.id ? { ...x, remindMe, reminderCount } : x)));
    patch(on, Math.max(0, c.reminderCount + (on ? 1 : -1)));
    try {
      const res = await setCouncilReminder(c.id, on);
      patch(res.remindMe, res.reminderCount);
      if (res.remindMe) void showToast('سنرسل لك تنبيهاً عند بدء المجلس', 'success');
    } catch (err) {
      patch(c.remindMe, c.reminderCount);
      void showToast(councilErrorMessage(err), 'error');
    }
  }, []);

  const startNow = useCallback(
    async (c: UpcomingData) => {
      if (upcomingBusy) return;
      setUpcomingBusy(c.id);
      try {
        await startScheduledCouncil(c.id);
        setUpcoming((list) => list.filter((x) => x.id !== c.id));
        safePush({ pathname: '/councils/[id]', params: { id: c.id } }, undefined, router);
      } catch (err) {
        if (err instanceof CouncilApiError && err.code === 'council_exists') {
          void showToast('أنهِ مجلسك المباشر أولاً ثم ابدأ المجلس المجدول', 'info');
        } else {
          void showToast(councilErrorMessage(err), 'error');
          void load();
        }
      } finally {
        setUpcomingBusy(null);
      }
    },
    [load, router, upcomingBusy],
  );

  if (Platform.OS === 'web') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="المجالس" showBack />
        <CouncilNotice title="المجالس في التطبيق" message={COUNCIL_WEB_TEXT} />
      </Screen>
    );
  }

  const section = (title: string, list: CouncilCardData[]) =>
    list.length ? (
      <Stack gap="sm">
        <AppText variant="label" color="textSecondary">
          {title}
        </AppText>
        {list.map((c) => (
          <CouncilCard key={c.id} council={c} onPress={open} />
        ))}
      </Stack>
    ) : null;

  const empty = !mine && !privateList.length && !publicList.length && !upcoming.length;

  const miniInset = session?.miniPlayerVisible ? COUNCIL_MINI_PLAYER_HEIGHT + COUNCIL_MINI_PLAYER_GAP : 0;
  const fabBottom = insets.bottom + spacing.lg + miniInset;
  const pressFab = (toValue: number) =>
    Animated.spring(fabScale, { toValue, useNativeDriver: true, speed: 40, bounciness: toValue === 1 ? 6 : 0 }).start();
  // Same action as the old big button: my live council if I have one, otherwise create.
  const startOrReturn = () => (mine ? open(mine) : safePush('/councils/create', undefined, router));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="المجالس" showBack />
      <ScreenBody
        gap="xl"
        padTop="sm"
        bottomInset="action"
        refreshControl={
          <AppRefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <AppText variant="bodySmall" color="textMuted">
          مجالس صوتية مباشرة — استمع، واطلب الكلمة، وشارك بهدوء.
        </AppText>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : error && empty ? (
          <CouncilNotice icon="alert-circle-outline" title="تعذّر تحميل المجالس" message={error} actionLabel="إعادة المحاولة" onAction={() => void load()} />
        ) : empty ? (
          <CouncilNotice title={COUNCILS_EMPTY_TEXT} message="ابدأ مجلسك وادعُ من تحب" />
        ) : (
          <>
            {section('مجلسك', mine ? [mine] : [])}
            {section('دعوات خاصة', privateList)}
            {section('مجالس مباشرة', sortCouncilsByHostTier(publicList))}
            {hasMore ? (
              <SarhButton title="عرض المزيد" variant="ghost" shape="pill" loading={loadingMore} onPress={() => void loadMore()} />
            ) : null}
            {upcoming.length ? (
              <Stack gap="sm">
                <AppText variant="label" color="textSecondary">
                  {COUNCILS_UPCOMING_TITLE}
                </AppText>
                {upcoming.map((c) => (
                  <CouncilUpcomingCard
                    key={c.id}
                    council={c}
                    busy={upcomingBusy === c.id}
                    onToggleRemind={(x) => void toggleRemind(x)}
                    onStart={(x) => void startNow(x)}
                  />
                ))}
              </Stack>
            ) : null}
          </>
        )}
      </ScreenBody>
      <Animated.View
        style={[
          styles.fab,
          councilFabAnchor(isAppRtl(), spacing.lg),
          { bottom: fabBottom, backgroundColor: colors.electric, transform: [{ scale: fabScale }] },
        ]}
      >
        <Pressable
          testID="council-start-fab"
          onPress={startOrReturn}
          onPressIn={() => pressFab(0.9)}
          onPressOut={() => pressFab(1)}
          accessibilityRole="button"
          accessibilityLabel={mine ? 'العودة إلى مجلسك' : 'بدء مجلس'}
          style={styles.fabHit}
        >
          <AppIcon name="mic" size={24} color={colors.onElectric} />
        </Pressable>
      </Animated.View>
      <CouncilMiniPlayer style={[styles.mini, { bottom: insets.bottom + spacing.sm }]} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  fab: {
    position: 'absolute',
    width: COUNCIL_FAB_SIZE,
    height: COUNCIL_FAB_SIZE,
    borderRadius: radius.pill,
  },
  fabHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mini: { position: 'absolute', left: 0, right: 0 },
});
