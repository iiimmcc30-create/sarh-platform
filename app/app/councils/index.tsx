// «المجالس» — live voice councils: my council, private invitations, public list.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CouncilCard } from '@/components/councils/CouncilCard';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { spacing } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { BottomAction, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { safePush } from '@/lib/safeNavigate';
import {
  COUNCIL_WEB_TEXT,
  COUNCILS_EMPTY_TEXT,
  councilErrorMessage,
  fetchAccessibleCouncils,
  fetchCouncils,
  type CouncilCard as CouncilCardData,
} from '@/services/councils';

export default function CouncilsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [mine, setMine] = useState<CouncilCardData | null>(null);
  const [privateList, setPrivateList] = useState<CouncilCardData[]>([]);
  const [publicList, setPublicList] = useState<CouncilCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const [acc, pub] = await Promise.all([fetchAccessibleCouncils(), fetchCouncils()]);
      if (id !== seq.current) return;
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

  const empty = !mine && !privateList.length && !publicList.length;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="المجالس" showBack />
      <ScreenBody
        gap="xl"
        padTop="sm"
        bottomInset="action"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.textMuted}
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
            {section('مجالس مباشرة', publicList)}
            {hasMore ? (
              <SarhButton title="عرض المزيد" variant="ghost" shape="pill" loading={loadingMore} onPress={() => void loadMore()} />
            ) : null}
          </>
        )}
      </ScreenBody>
      <BottomAction>
        {mine ? (
          <SarhButton title="العودة إلى مجلسك" leftIcon="mic" shape="pill" fullWidth onPress={() => open(mine)} />
        ) : (
          <SarhButton
            title="بدء مجلس"
            leftIcon="mic"
            shape="pill"
            fullWidth
            onPress={() => safePush('/councils/create', undefined, router)}
          />
        )}
      </BottomAction>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
});
