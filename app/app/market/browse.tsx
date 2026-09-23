import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ListingCard } from '@/components/feature/ListingCard';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { ds } from '@/constants/designSystem';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhChip, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { compareListingBoostPriority, interleavePromotedListings } from '@/lib/listingSort';
import { listingMatchesMarketSelection } from '@/lib/marketCategoriesFallback';
import { safePush } from '@/lib/safeNavigate';
import { fetchMarketCategories } from '@/services/categories';
import {
  mergeListingPages,
  searchListingsPage,
  shouldFetchNextListingPage,
} from '@/services/listings';
import { type Country, type Listing } from '@/services/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

type SortMode = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

export default function MarketBrowseScreen() {
  const params = useLocalSearchParams<{
    categoryId?: string;
    subcategoryId?: string;
    parentName?: string;
    parentEmoji?: string;
    subName?: string;
    subEmoji?: string;
  }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { styles, colors } = useThemedStyles(({ colors }) => ({
    styles: createStyles(colors),
    colors,
  }));

  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : undefined;
  const subcategoryId =
    typeof params.subcategoryId === 'string' ? params.subcategoryId : undefined;
  const parentName = typeof params.parentName === 'string' ? params.parentName : '';
  const parentEmoji = typeof params.parentEmoji === 'string' ? params.parentEmoji : '';
  const subName = typeof params.subName === 'string' ? params.subName : '';
  const subEmoji = typeof params.subEmoji === 'string' ? params.subEmoji : '';
  const headerTitle = subName || parentName || 'السوق';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCountry, setActiveCountry] = useState<Country | 'ALL'>('ALL');
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [items, setItems] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadGenRef = useRef(0);
  const hasItemsRef = useRef(false);
  hasItemsRef.current = items.length > 0;

  const searchParams = useMemo(
    () => ({
      categoryId,
      subcategoryId,
      search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
      country: activeCountry === 'ALL' ? undefined : activeCountry,
      featured: showFeaturedOnly || undefined,
    }),
    [activeCountry, categoryId, debouncedSearch, showFeaturedOnly, subcategoryId],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const applyClientFilters = useCallback(
    async (listings: Listing[]) => {
      let next = listings.filter((l) => l.country !== 'EG');
      if (categoryId) {
        const tree = await fetchMarketCategories();
        const parent = tree.find((c) => c.id === categoryId);
        const sub =
          parent?.children?.find((c) => c.id === subcategoryId) ??
          tree.flatMap((p) => p.children ?? []).find((c) => c.id === subcategoryId);
        if (parent) {
          next = next.filter((l) => listingMatchesMarketSelection(l, parent, sub ?? null));
        }
      }
      return next;
    },
    [categoryId, subcategoryId],
  );

  const loadFirstPage = useCallback(async () => {
    const gen = ++loadGenRef.current;
    if (!categoryId && !subcategoryId) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setLoadFailed(false);
      setLoading(false);
      return;
    }
    if (!hasItemsRef.current) setLoading(true);
    setLoadFailed(false);
    try {
      const page = await searchListingsPage(searchParams, accessToken);
      if (gen !== loadGenRef.current) return;
      setItems(await applyClientFilters(page.listings));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoadFailed(false);
    } catch {
      if (gen !== loadGenRef.current) return;
      // Keep the last good page — a failed refetch must not wipe the list.
      setLoadFailed(true);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [accessToken, applyClientFilters, categoryId, searchParams, subcategoryId]);

  const loadNextPage = useCallback(async () => {
    if (
      !shouldFetchNextListingPage({
        hasMore,
        nextCursor,
        loading,
        loadingMore: loadingMoreRef.current,
      })
    ) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await searchListingsPage(
        { ...searchParams, cursor: nextCursor ?? undefined },
        accessToken,
      );
      const extra = await applyClientFilters(page.listings);
      setItems((prev) => mergeListingPages(prev, extra));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [accessToken, applyClientFilters, hasMore, loading, nextCursor, searchParams]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const filtered = useMemo(() => {
    let list = items.filter((l) => {
      if (showFeaturedOnly && !l.featured) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'oldest') {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      if (sortMode === 'price_asc') return a.price - b.price;
      if (sortMode === 'price_desc') return b.price - a.price;
      // newest + boost
      return compareListingBoostPriority(a, b);
    });

    return interleavePromotedListings(list);
  }, [items, showFeaturedOnly, sortMode]);

  const cycleSort = () => {
    setSortMode((prev) => {
      if (prev === 'newest') return 'oldest';
      if (prev === 'oldest') return 'price_asc';
      if (prev === 'price_asc') return 'price_desc';
      return 'newest';
    });
  };

  const sortLabel =
    sortMode === 'newest'
      ? 'الأحدث'
      : sortMode === 'oldest'
        ? 'الأقدم'
        : sortMode === 'price_asc'
          ? 'السعر ↑'
          : 'السعر ↓';

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Listing>) => (
      <ListingCard
        listing={item}
        variant="list"
        listMode="market"
        onPress={() =>
          safePush({ pathname: '/listing/[id]', params: { id: item.id } }, undefined, router)
        }
      />
    ),
    [router],
  );

  const crumb =
    `السوق` +
    (parentName ? ` / ${parentEmoji ? `${parentEmoji} ` : ''}${parentName}` : '') +
    (subName ? ` / ${subEmoji ? `${subEmoji} ` : ''}${subName}` : '');

  const ListHeader = (
    <View>
      {parentName || subName ? (
        <View style={styles.crumbShell}>
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {crumb}
          </AppText>
        </View>
      ) : null}

      <Row gap="sm" style={styles.searchRow}>
        <Pressable
          style={[styles.filterStarBtn, showFeaturedOnly && styles.filterStarBtnActive]}
          onPress={() => setShowFeaturedOnly(!showFeaturedOnly)}
        >
          <AppIcon
            name="star"
            size={18}
            color={showFeaturedOnly ? colors.gold : colors.textPrimary}
            variant={showFeaturedOnly ? 'sr' : 'rr'}
          />
        </Pressable>
        <SarhInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث ضمن هذا التصنيف..."
          leadingIcon="search"
          clearButtonMode="while-editing"
          containerStyle={styles.searchInput}
        />
      </Row>

      <Row gap="sm" style={styles.filterRow}>
        <SarhChip
          appearance="filter"
          label="السعودية"
          selected={activeCountry === 'SA'}
          onPress={() => setActiveCountry(activeCountry === 'SA' ? 'ALL' : 'SA')}
        />
        <SarhChip appearance="filter" label={sortLabel} icon="sort-alt" chevron onPress={cycleSort} />
      </Row>

      <Row justify="end" style={styles.countRow}>
        <AppText variant="caption" color="textMuted">
          {loading ? 'جاري التحميل...' : `${filtered.length} إعلان${hasMore ? '+' : ''}`}
        </AppText>
      </Row>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" showBack title={headerTitle} />
      <ScreenBody scroll={false} gutter={false}>
        {(loading || loadFailed) && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.electric} />
          </View>
        ) : (
          <AppFlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              loading || loadFailed ? (
                <Stack gap="md" align="center" style={styles.empty}>
                  <ActivityIndicator color={colors.electric} />
                </Stack>
              ) : (
                <Stack gap="md" align="center" style={styles.empty}>
                  <AppText variant="heading2" align="center">
                    🔍
                  </AppText>
                  <AppText variant="body" color="textMuted" align="center">
                    لا توجد إعلانات في هذا التصنيف
                  </AppText>
                </Stack>
              )
            }
            ListFooterComponent={
              <View style={styles.listFooter}>
                {loadingMore ? <ActivityIndicator color={colors.electric} /> : null}
              </View>
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              void loadNextPage();
            }}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={8}
          />
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    crumbShell: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    searchRow: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    filterStarBtn: {
      width: ds.iconBtn.md,
      height: ds.iconBtn.md,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
    },
    filterStarBtnActive: {
      borderColor: colors.gold,
      backgroundColor: `${colors.gold}12`,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
    },
    filterRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    countRow: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    empty: { paddingVertical: spacing.xxxl },
    listFooter: {
      alignItems: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
