import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CollectionCreateFab } from '@/components/feature/collections/CollectionCreateFab';
import { CollectionRow } from '@/components/feature/collections/CollectionRow';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { SkeletonBox, SkeletonRegion } from '@/components/ui/skeleton';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { AppText, SarhDivider, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { requireAuth } from '@/lib/postInteractions';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COLLECTIONS_EMPTY_TEXT,
  COLLECTIONS_NO_MATCH_TEXT,
  MEMBER_OF_SECTION_TITLE,
  fetchMemberOfCollections,
  fetchMyCollections,
  fetchSuggestedCollections,
  mergeById,
  searchCollections,
  setFollowCollection,
  type Collection,
} from '@/services/collections';

type Section = 'discover' | 'mine' | 'memberOf';

/** Route param that scrolls to «المضاف إليها» (profile ••• menu). */
const COLLECTIONS_MEMBER_OF_SECTION = 'member-of';

const MEMBER_OF_HEADER_ID = 'h-member-of';

type ListRow =
  | { kind: 'header'; id: string; title: string }
  | { kind: 'collection'; id: string; section: Section; collection: Collection }
  | { kind: 'empty'; id: string; text: string };

function RowSkeleton() {
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  return (
    <View style={styles.skelRow}>
      <SkeletonBox width={52} height={52} radius={radius.md} />
      <View style={styles.skelMeta}>
        <SkeletonBox width="70%" height={14} radius={4} />
        <SkeletonBox width="40%" height={12} radius={4} />
      </View>
      <SkeletonBox width={72} height={32} radius={999} />
    </View>
  );
}

export default function CollectionsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { me } = useAppUser();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const params = useLocalSearchParams<{ section?: string; userId?: string }>();
  // «المضاف إليها»: collections where this user is a MEMBER (a visited profile, or me).
  const memberUserId =
    (typeof params.userId === 'string' && params.userId) || (isAuthenticated ? me.id : '');
  const scrollToMemberOf = params.section === COLLECTIONS_MEMBER_OF_SECTION;
  const listRef = useRef<FlatList<ListRow>>(null);
  const didScroll = useRef(false);
  const [memberOf, setMemberOf] = useState<Collection[]>([]);
  const [memberOfCursor, setMemberOfCursor] = useState<string | null>(null);
  const [memberOfMore, setMemberOfMore] = useState(false);

  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [discover, setDiscover] = useState<Collection[]>([]);
  const [mine, setMine] = useState<Collection[]>([]);
  const [discoverCursor, setDiscoverCursor] = useState<string | null>(null);
  const [mineCursor, setMineCursor] = useState<string | null>(null);
  const [discoverMore, setDiscoverMore] = useState(false);
  const [mineMore, setMineMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean; q?: string }) => {
      const q = (opts?.q ?? applied).trim();
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        if (q) {
          const page = await searchCollections(q);
          if (!mounted.current) return;
          setDiscover(page.collections);
          setDiscoverCursor(page.nextCursor);
          setDiscoverMore(page.hasMore);
          setMine([]);
          setMineCursor(null);
          setMineMore(false);
          setMemberOf([]);
          setMemberOfCursor(null);
          setMemberOfMore(false);
        } else {
          const none = { collections: [] as Collection[], nextCursor: null, hasMore: false };
          const [suggested, owned, member] = await Promise.all([
            fetchSuggestedCollections(),
            isAuthenticated ? fetchMyCollections() : Promise.resolve(none),
            memberUserId
              ? fetchMemberOfCollections(memberUserId).catch(() => none)
              : Promise.resolve(none),
          ]);
          if (!mounted.current) return;
          setDiscover(suggested.collections);
          setDiscoverCursor(suggested.nextCursor);
          setDiscoverMore(suggested.hasMore);
          setMine(owned.collections);
          setMineCursor(owned.nextCursor);
          setMineMore(owned.hasMore);
          setMemberOf(member.collections);
          setMemberOfCursor(member.nextCursor);
          setMemberOfMore(member.hasMore);
        }
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : 'تعذّر تحميل القوائم');
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applied, isAuthenticated, memberUserId],
  );

  useFocusEffect(
    useCallback(() => {
      void load({ soft: true });
    }, [load]),
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setApplied(query.trim());
    }, 320);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  useEffect(() => {
    // Defer so we don't setState synchronously inside the effect body.
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on applied search only

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ soft: true });
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    const searching = Boolean(applied.trim());
    const canDiscover = discoverMore && discoverCursor;
    const canMine = !searching && mineMore && mineCursor;
    const canMember = !searching && memberOfMore && memberOfCursor && memberUserId;
    if (!canDiscover && !canMine && !canMember) return;
    setLoadingMore(true);
    try {
      if (canDiscover) {
        const page = searching
          ? await searchCollections(applied, discoverCursor)
          : await fetchSuggestedCollections(discoverCursor);
        if (!mounted.current) return;
        setDiscover((prev) => mergeById(prev, page.collections));
        setDiscoverCursor(page.nextCursor);
        setDiscoverMore(page.hasMore);
      } else if (canMine) {
        const page = await fetchMyCollections(mineCursor);
        if (!mounted.current) return;
        setMine((prev) => mergeById(prev, page.collections));
        setMineCursor(page.nextCursor);
        setMineMore(page.hasMore);
      } else if (canMember) {
        const page = await fetchMemberOfCollections(memberUserId, memberOfCursor);
        if (!mounted.current) return;
        setMemberOf((prev) => mergeById(prev, page.collections));
        setMemberOfCursor(page.nextCursor);
        setMemberOfMore(page.hasMore);
      }
    } catch {
      /* keep what we have */
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [
    applied,
    discoverCursor,
    discoverMore,
    loading,
    loadingMore,
    memberOfCursor,
    memberOfMore,
    memberUserId,
    mineCursor,
    mineMore,
  ]);

  const toggleFollow = useCallback(
    async (collection: Collection) => {
      if (!requireAuth(isAuthenticated, 'إضافة القوائم')) return;
      setFollowBusy(collection.id);
      try {
        const next = !collection.isFollowing;
        const res = await setFollowCollection(collection.id, next);
        const patch = (c: Collection): Collection =>
          c.id === collection.id
            ? {
                ...c,
                isFollowing: res.following,
                followersCount: res.followersCount,
              }
            : c;
        setDiscover((prev) => prev.map(patch));
        setMemberOf((prev) => prev.map(patch));
        if (res.following) {
          setMine((prev) =>
            prev.some((c) => c.id === collection.id)
              ? prev.map(patch)
              : [{ ...collection, isFollowing: true, followersCount: res.followersCount }, ...prev],
          );
        } else {
          setMine((prev) => prev.filter((c) => c.id !== collection.id || c.isOwner));
          setDiscover((prev) => {
            if (prev.some((c) => c.id === collection.id)) return prev.map(patch);
            return [
              { ...collection, isFollowing: false, followersCount: res.followersCount },
              ...prev,
            ];
          });
        }
      } catch (err) {
        void showToast(err instanceof Error ? err.message : 'تعذّر تحديث المتابعة', 'error');
      } finally {
        if (mounted.current) setFollowBusy(null);
      }
    },
    [isAuthenticated],
  );

  const searching = Boolean(applied.trim());
  const rows: ListRow[] = [];
  if (searching) {
    rows.push({ kind: 'header', id: 'h-search', title: 'نتائج البحث' });
    if (!loading && discover.length === 0) {
      rows.push({ kind: 'empty', id: 'e-search', text: COLLECTIONS_NO_MATCH_TEXT });
    } else {
      for (const c of discover) {
        rows.push({ kind: 'collection', id: `d-${c.id}`, section: 'discover', collection: c });
      }
    }
  } else {
    rows.push({ kind: 'header', id: 'h-discover', title: 'اكتشف القوائم الجديدة' });
    if (!loading && discover.length === 0) {
      rows.push({ kind: 'empty', id: 'e-discover', text: COLLECTIONS_EMPTY_TEXT });
    } else {
      for (const c of discover) {
        rows.push({ kind: 'collection', id: `d-${c.id}`, section: 'discover', collection: c });
      }
    }
    if (isAuthenticated) {
      rows.push({ kind: 'header', id: 'h-mine', title: 'قوائمي' });
      if (!loading && mine.length === 0) {
        rows.push({ kind: 'empty', id: 'e-mine', text: COLLECTIONS_EMPTY_TEXT });
      } else {
        for (const c of mine) {
          rows.push({ kind: 'collection', id: `m-${c.id}`, section: 'mine', collection: c });
        }
      }
    }
    // «المضاف إليها»: hidden entirely (no title, no empty text) when there are none.
    if (memberOf.length > 0) {
      rows.push({ kind: 'header', id: MEMBER_OF_HEADER_ID, title: MEMBER_OF_SECTION_TITLE });
      for (const c of memberOf) {
        rows.push({ kind: 'collection', id: `a-${c.id}`, section: 'memberOf', collection: c });
      }
    }
  }
  const memberOfHeaderIndex = rows.findIndex((r) => r.id === MEMBER_OF_HEADER_ID);

  useEffect(() => {
    if (!scrollToMemberOf || didScroll.current || loading || memberOfHeaderIndex < 0) return;
    didScroll.current = true;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: memberOfHeaderIndex, animated: true, viewPosition: 0 });
    }, 50);
    return () => clearTimeout(t);
  }, [loading, memberOfHeaderIndex, scrollToMemberOf]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ListRow>) => {
      if (item.kind === 'header') {
        return (
          <AppText
            variant="label"
            color="textPrimary"
            style={[styles.sectionTitle, index === 0 ? styles.sectionFirst : null]}
          >
            {item.title}
          </AppText>
        );
      }
      if (item.kind === 'empty') {
        return (
          <AppText variant="body" color="textMuted" align="center" style={styles.emptyText}>
            {item.text}
          </AppText>
        );
      }
      const next = rows[index + 1];
      const showDivider = next?.kind === 'collection' && next.section === item.section;
      return (
        <View>
          <CollectionRow
            collection={item.collection}
            addBusy={followBusy === item.collection.id}
            onAdd={
              item.section !== 'mine' || !item.collection.isOwner
                ? () => void toggleFollow(item.collection)
                : undefined
            }
            onPress={() =>
              safePush(
                { pathname: '/collections/[id]', params: { id: item.collection.id } },
                undefined,
                router,
              )
            }
          />
          {showDivider ? <SarhDivider style={styles.divider} /> : null}
        </View>
      );
    },
    [followBusy, router, rows, styles, toggleFollow],
  );

  const openCreate = useCallback(() => {
    if (!requireAuth(isAuthenticated, 'إنشاء قائمة')) return;
    safePush('/collections/create', undefined, router);
  }, [isAuthenticated, router]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="القوائم" showBack />
      <ScreenBody scroll={false} gutter={false}>
        <View style={styles.searchWrap}>
          <SarhInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن قائمة"
            leadingIcon="search"
            size="compact"
            shape="pill"
            appearance="theme"
            returnKeyType="search"
            onSubmitEditing={() => setApplied(query.trim())}
            trailingIcon={query ? 'close-circle' : undefined}
            onTrailingPress={query ? () => setQuery('') : undefined}
            accessibilityRole="search"
            accessibilityLabel="بحث في القوائم"
          />
        </View>

        {loading && discover.length === 0 && mine.length === 0 ? (
          <SkeletonRegion style={styles.skelList}>
            {[0, 1, 2, 3, 4].map((i) => (
              <RowSkeleton key={i} />
            ))}
          </SkeletonRegion>
        ) : error && discover.length === 0 && mine.length === 0 ? (
          <Stack gap="md" align="center" style={styles.errorBox}>
            <AppText variant="body" color="textMuted" align="center">
              {error}
            </AppText>
            <Pressable onPress={() => void load()} accessibilityRole="button">
              <AppText variant="label" color="primary">
                إعادة المحاولة
              </AppText>
            </Pressable>
          </Stack>
        ) : (
          <AppFlatList
            ref={listRef}
            data={rows}
            onScrollToIndexFailed={({ averageItemLength, index }) =>
              listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
            }
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.electric}
              />
            }
            ListFooterComponent={
              <View style={styles.footer}>
                {loadingMore ? <ActivityIndicator color={colors.electric} /> : null}
              </View>
            }
          />
        )}
      </ScreenBody>
      <CollectionCreateFab onPress={openCreate} />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    searchWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: colors.screenRoot,
    },
    sectionTitle: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionFirst: { paddingTop: spacing.sm },
    emptyText: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    divider: { marginHorizontal: spacing.lg },
    listContent: { flexGrow: 1, paddingBottom: 120 },
    footer: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      minHeight: 48,
    },
    skelList: { paddingTop: spacing.sm },
    skelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    skelMeta: { flex: 1, gap: 8 },
    errorBox: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
  });
}
