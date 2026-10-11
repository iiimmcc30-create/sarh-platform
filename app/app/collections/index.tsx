import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CollectionCreateFab } from '@/components/feature/collections/CollectionCreateFab';
import { CollectionRow } from '@/components/feature/collections/CollectionRow';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { SkeletonBox, SkeletonRegion } from '@/components/ui/skeleton';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { AppText, SarhBackButton, SarhDivider, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { applyCollectionFollow, sortPinnedFirst } from '@/lib/collectionLists';
import { loadPinnedCollectionIds, setCollectionPinned } from '@/lib/collectionPins';
import { requireAuth } from '@/lib/postInteractions';
import { getRtlRow } from '@/lib/rtl';
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
const DISCOVER_PREVIEW = 3;

type ListRow =
  | { kind: 'header'; id: string; title: string }
  | { kind: 'collection'; id: string; section: Section; collection: Collection }
  | { kind: 'more'; id: string }
  | { kind: 'empty'; id: string; text: string };

function RowSkeleton() {
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  return (
    <View style={styles.skelRow}>
      <SkeletonBox width={48} height={48} radius={radius.md} />
      <View style={styles.skelMeta}>
        <SkeletonBox width="70%" height={14} radius={4} />
        <SkeletonBox width="46%" height={12} radius={4} />
      </View>
      <SkeletonBox width={32} height={32} radius={16} />
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
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuY = useRef(new Animated.Value(-8)).current;
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadPinnedCollectionIds()
      .then((ids) => {
        if (mounted.current) setPinned(new Set(ids));
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: menuOpen ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(menuY, {
        toValue: menuOpen ? 0 : -8,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [menuOpen, menuOpacity, menuY]);

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
    const canDiscover = searching && discoverMore && discoverCursor;
    const canMine = !searching && mineMore && mineCursor;
    const canMember = !searching && memberOfMore && memberOfCursor && memberUserId;
    if (!canDiscover && !canMine && !canMember) return;
    setLoadingMore(true);
    try {
      if (canDiscover) {
        const page = await searchCollections(applied, discoverCursor);
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
      if (collection.isFollowing || followBusy) return;
      const optimistic = applyCollectionFollow(collection, true);
      setDiscover((prev) => prev.filter((c) => c.id !== collection.id));
      setMine((prev) =>
        prev.some((c) => c.id === collection.id) ? prev : [optimistic, ...prev],
      );
      setMemberOf((prev) => prev.map((c) => (c.id === collection.id ? optimistic : c)));
      setFollowBusy(collection.id);
      try {
        const res = await setFollowCollection(collection.id, true);
        const confirm = (c: Collection): Collection =>
          c.id === collection.id
            ? { ...c, isFollowing: res.following, followersCount: res.followersCount }
            : c;
        if (!mounted.current) return;
        setMine((prev) => prev.map(confirm));
        setMemberOf((prev) => prev.map(confirm));
      } catch (err) {
        if (!mounted.current) return;
        setDiscover((prev) => [collection, ...prev.filter((c) => c.id !== collection.id)]);
        setMine((prev) => prev.filter((c) => c.id !== collection.id));
        setMemberOf((prev) => prev.map((c) => (c.id === collection.id ? collection : c)));
        void showToast(err instanceof Error ? err.message : 'تعذّر تحديث المتابعة', 'error');
      } finally {
        if (mounted.current) setFollowBusy(null);
      }
    },
    [followBusy, isAuthenticated],
  );

  const togglePin = useCallback(
    async (collection: Collection) => {
      const next = !pinned.has(collection.id);
      setPinned((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(collection.id);
        else copy.delete(collection.id);
        return copy;
      });
      try {
        const ids = await setCollectionPinned(collection.id, next);
        if (mounted.current) setPinned(new Set(ids));
      } catch {
        if (!mounted.current) return;
        setPinned((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(collection.id);
          else copy.add(collection.id);
          return copy;
        });
        void showToast('تعذّر تثبيت القائمة', 'error');
      }
    },
    [pinned],
  );

  const searching = Boolean(applied.trim());
  const discoverShown = searching ? discover : discover.slice(0, DISCOVER_PREVIEW);
  const showDiscoverMore = !searching && (discover.length > DISCOVER_PREVIEW || discoverMore);
  const mineShown = sortPinnedFirst(mine, pinned);
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
    rows.push({ kind: 'header', id: 'h-discover', title: 'اكتشاف قوائم جديدة' });
    if (!loading && discover.length === 0) {
      rows.push({ kind: 'empty', id: 'e-discover', text: COLLECTIONS_EMPTY_TEXT });
    } else {
      for (const c of discoverShown) {
        rows.push({ kind: 'collection', id: `d-${c.id}`, section: 'discover', collection: c });
      }
    }
    if (showDiscoverMore) rows.push({ kind: 'more', id: 'discover-more' });
    if (isAuthenticated) {
      rows.push({ kind: 'header', id: 'h-mine', title: 'قوائمك' });
      if (!loading && mine.length === 0) {
        rows.push({ kind: 'empty', id: 'e-mine', text: COLLECTIONS_EMPTY_TEXT });
      } else {
        for (const c of mineShown) {
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

  const openCollection = useCallback(
    (collection: Collection) => {
      safePush({ pathname: '/collections/[id]', params: { id: collection.id } }, undefined, router);
    },
    [router],
  );

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
      if (item.kind === 'more') {
        return (
          <View>
            <Pressable
              onPress={() => safePush('/collections/suggested', undefined, router)}
              style={styles.moreHit}
              accessibilityRole="link"
              accessibilityLabel="عرض المزيد"
            >
              <AppText variant="label" color="primary">
                عرض المزيد
              </AppText>
            </Pressable>
            <SarhDivider />
          </View>
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
      const mineRow = item.section === 'mine';
      return (
        <View>
          <CollectionRow
            collection={item.collection}
            mode={mineRow ? 'mine' : 'discover'}
            pinned={pinned.has(item.collection.id)}
            busy={followBusy === item.collection.id}
            onFollow={mineRow ? undefined : () => void toggleFollow(item.collection)}
            onPin={mineRow ? () => void togglePin(item.collection) : undefined}
            onPress={() => openCollection(item.collection)}
          />
          {showDivider ? <SarhDivider /> : null}
        </View>
      );
    },
    [followBusy, openCollection, pinned, router, rows, styles, toggleFollow, togglePin],
  );

  const openCreate = useCallback(() => {
    if (!requireAuth(isAuthenticated, 'إنشاء قائمة')) return;
    safePush('/collections/create', undefined, router);
  }, [isAuthenticated, router]);

  const openListedIn = useCallback(() => {
    setMenuOpen(false);
    if (memberOfHeaderIndex >= 0) {
      listRef.current?.scrollToIndex({
        index: memberOfHeaderIndex,
        animated: true,
        viewPosition: 0,
      });
      return;
    }
    if (memberUserId) {
      safePush(
        { pathname: '/collections', params: { section: 'member-of', userId: memberUserId } },
        undefined,
        router,
      );
    }
  }, [memberOfHeaderIndex, memberUserId, router]);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.header, getRtlRow()]}>
        <SarhBackButton onPress={() => router.back()} />
        <View style={styles.search}>
          <SarhInput
            value={query}
            onChangeText={setQuery}
            placeholder="بحث عن القوائم"
            leadingIcon="search"
            size="compact"
            shape="pill"
            appearance="theme"
            returnKeyType="search"
            onSubmitEditing={() => setApplied(query.trim())}
            trailingIcon={query ? 'close-circle' : undefined}
            onTrailingPress={query ? () => setQuery('') : undefined}
            accessibilityRole="search"
            accessibilityLabel="بحث عن القوائم"
          />
        </View>
        <Pressable
          onPress={() => setMenuOpen((open) => !open)}
          style={styles.overflow}
          accessibilityRole="button"
          accessibilityLabel="المزيد"
        >
          <AppIcon name="ellipsis-vertical" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
      {menuOpen ? (
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Animated.View
            style={[
              styles.menu,
              { opacity: menuOpacity, transform: [{ translateY: menuY }] },
            ]}
          >
            <Pressable
              onPress={openListedIn}
              style={styles.menuItem}
              accessibilityRole="button"
              accessibilityLabel="القوائم التي أنت مدرج بها"
            >
              <AppText variant="body" color="textPrimary">
                القوائم التي أنت مدرج بها
              </AppText>
            </Pressable>
          </Animated.View>
        </Pressable>
      ) : null}

      <ScreenBody scroll={false} gutter={false}>
        {loading && discover.length === 0 && mine.length === 0 ? (
          <SkeletonRegion style={styles.skelList}>
            {[0, 1, 2, 3, 4].map((i) => (
              <RowSkeleton key={i} />
            ))}
          </SkeletonRegion>
        ) : error && discover.length === 0 && mine.length === 0 ? (
          <View style={styles.errorBox}>
            <AppText variant="body" color="textMuted" align="center">
              {error}
            </AppText>
            <Pressable onPress={() => void load()} accessibilityRole="button">
              <AppText variant="label" color="primary">
                إعادة المحاولة
              </AppText>
            </Pressable>
          </View>
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
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListFooterComponent={
              <View style={styles.footer}>
                {loadingMore ? <ActivityIndicator color={colors.textMuted} /> : null}
              </View>
            }
          />
        )}
      </ScreenBody>
      <CollectionCreateFab onPress={openCreate} bottomOffset={spacing.lg} />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.screenRoot,
    },
    search: { flex: 1, minWidth: 0 },
    overflow: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 30,
    },
    menu: {
      position: 'absolute',
      top: 52,
      end: spacing.md,
      minWidth: 220,
      backgroundColor: colors.bgElevated,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    menuItem: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    sectionTitle: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionFirst: { paddingTop: spacing.sm },
    moreHit: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    emptyText: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
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
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
  });
}
