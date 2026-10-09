import { MarketAppBar } from '@/components/market/MarketAppBar';
import { MarketFilterBar } from '@/components/market/MarketFilterBar';
import { MarketCategoryPicker } from '@/components/market/MarketCategoryPicker';
import { RegionCityPicker } from '@/components/market/RegionCityPicker';
import { NearbyFilterChips } from '@/components/market/NearbyFilterChips';
import { SaudiCityPickerSheet } from '@/components/market/SaudiCityPickerSheet';
import { ListingCard } from '@/components/feature/ListingCard';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { ListingCardSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { listingCardSkeletonPitch } from '@/components/ui/skeleton/ListingCardSkeleton';
import { useListingListMetrics } from '@/components/feature/useListingListMetrics';
import { skeletonFillCount } from '@/components/ui/skeleton/skeletonTokens';
import { AppText } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketCategories } from '@/hooks/useMarketCategories';
import { useTheme } from '@/hooks/useTheme';
import {
  compareListingBoostPriority,
  feedSortLabelAr,
  interleavePromotedListings,
  toggleFeedSortMode,
  type FeedSortMode,
} from '@/lib/listingSort';
import { listingMatchesMarketSelection } from '@/lib/marketCategoriesFallback';
import { listingMatchesRegionSelection } from '@/lib/saudiRegionSearch';
import { detectDeviceCity } from '@/lib/deviceCity';
import {
  applyNearbyChip,
  initialNearbyState,
  nearbyApiParams,
  type NearbyChip,
  type NearbyState,
} from '@/lib/nearbyFeed';
import type { SaudiCityEntry } from '@/lib/saudiCities';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  getBootstrappedListingsPage,
  mergeListingPages,
  searchListingsPage,
  shouldFetchNextListingPage,
} from '@/services/listings';
import { Listing } from '@/services/types';
import type { RegionSelection } from '@/constants/saudiRegions';
import { spacing } from '@/constants/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type ViewToken,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { goldSellersFirstInRegion } from '@/lib/goldSeller';
import {
  PROMOTION_VIEWABILITY,
  trackPromotedClick,
  trackPromotedImpression,
} from '@/lib/promotionTracking';

const MARKET_FOCUS_TTL_MS = 60_000;
const EMPTY_LISTINGS: Listing[] = [];

export type MarketListingsFeedHandle = {
  refresh: () => Promise<void>;
};

type MarketListingsFeedProps = {
  variant?: 'home' | 'market';
  extraHeader?: ReactNode;
  padTop?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export const MarketListingsFeed = forwardRef<MarketListingsFeedHandle, MarketListingsFeedProps>(
  function MarketListingsFeed(
    {
      variant = 'market',
      extraHeader,
      padTop = 0,
      onScroll,
      onScrollEndDrag,
      onMomentumScrollEnd,
    },
    ref,
  ) {
    const router = useRouter();
    const { accessToken } = useAuth();
    const { colors } = useTheme();
    const { categories, reload: reloadCategories } = useMarketCategories();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    // Card height / gap scale with the screen width (shared listingCardLayout metrics).
    const listMetrics = useListingListMetrics();
    // First load fills the visible area with rows of the real ListingCard height.
    const skeletonCount = skeletonFillCount(
      windowHeight - padTop,
      listingCardSkeletonPitch(windowWidth),
      { min: 4, max: 8 },
    );
    const lastCategoriesFocusAt = useRef(0);
    const listRef = useRef<FlatList<Listing>>(null);
    const loadingMoreRef = useRef(false);
    const loadGenRef = useRef(0);
    const hasItemsRef = useRef(false);
    const loadingRef = useRef(true);
    const skipFirstFocusRef = useRef(true);

    const [activeParentId, setActiveParentId] = useState<string | null>(null);
    const [activeSubId, setActiveSubId] = useState<string | null>(null);
    const [regionSelection, setRegionSelection] = useState<RegionSelection>({ type: 'all' });
    const [regionPickerOpen, setRegionPickerOpen] = useState(false);
    const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
    const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
    const [sortMode, setSortMode] = useState<FeedSortMode>('newest');
    // «القريب»: server radius feed around the device point or a picked city (session only).
    const [nearby, setNearby] = useState<NearbyState | null>(null);
    const nearbyActive = nearby !== null;
    const [nearbyLocating, setNearbyLocating] = useState(false);
    const [cityPickerOpen, setCityPickerOpen] = useState(false);
    const [cityPickerMessage, setCityPickerMessage] = useState<string | undefined>(undefined);
    const nearbyBusyRef = useRef(false);
    const [items, setItems] = useState<Listing[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    // True between a sort toggle and the first page of the new order: rows from
    // the previous order are hidden (never shown under the new label).
    const [orderLoading, setOrderLoading] = useState(false);
    const orderSwitchFromRef = useRef<FeedSortMode | null>(null);
    const queryResetRef = useRef(false);
    const sortModeRef = useRef<FeedSortMode>(sortMode);
    sortModeRef.current = sortMode;
    hasItemsRef.current = items.length > 0;
    loadingRef.current = loading;

    const apiFilters = useMemo(
      () => ({
        featured: showFeaturedOnly || undefined,
        categoryId: activeSubId ?? activeParentId ?? undefined,
        subcategoryId: activeSubId ?? undefined,
        // Sorting happens at the API (createdAt DESC/ASC + matching cursor), so the
        // order is part of every page request and of the fetch/dedupe URL key.
        sort: sortMode === 'oldest' ? ('oldest' as const) : undefined,
        // «القريب»: origin + radius, and its own order (nearest / newest) overrides `sort`.
        ...nearbyApiParams(nearby),
      }),
      [nearby, showFeaturedOnly, activeParentId, activeSubId, sortMode],
    );

    const loadFirstPage = useCallback(async () => {
      const gen = ++loadGenRef.current;
      const hasServerFilters = Boolean(
        apiFilters.featured || apiFilters.categoryId || apiFilters.subcategoryId ||
          apiFilters.sort || apiFilters.near || apiFilters.nearCityId,
      );
      if (!hasServerFilters) {
        const boot = getBootstrappedListingsPage(accessToken);
        if (boot) {
          if (gen !== loadGenRef.current) return;
          setItems(boot.listings);
          setNextCursor(boot.nextCursor);
          setHasMore(boot.hasMore);
          setLoadFailed(false);
          setLoading(false);
          orderSwitchFromRef.current = null;
          queryResetRef.current = false;
          setOrderLoading(false);
          return;
        }
      }
      if (!hasItemsRef.current) setLoading(true);
      setLoadFailed(false);
      try {
        const page = await searchListingsPage(apiFilters, accessToken);
        if (gen !== loadGenRef.current) return;
        setItems(page.listings);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setLoadFailed(false);
        orderSwitchFromRef.current = null;
        queryResetRef.current = false;
        setOrderLoading(false);
      } catch {
        if (gen !== loadGenRef.current) return;
        // Keep the last good page — HTTP/network failure must not wipe the list.
        setLoadFailed(true);
        if (queryResetRef.current) {
          // A new «القريب» origin/radius failed: the hidden rows belong to the old
          // query, so fall back to the error/retry state instead of showing them.
          queryResetRef.current = false;
          setOrderLoading(false);
          setItems(EMPTY_LISTINGS);
        }
        const previousOrder = orderSwitchFromRef.current;
        if (previousOrder) {
          // The new order could not load: return the toggle to the order the
          // kept rows are actually in, so label and list always agree.
          orderSwitchFromRef.current = null;
          setOrderLoading(false);
          setSortMode(previousOrder);
          showToast('تعذّر تغيير الترتيب، حاول مجدداً', 'error');
        }
      } finally {
        if (gen === loadGenRef.current) setLoading(false);
      }
    }, [accessToken, apiFilters]);

    const loadNextPage = useCallback(async () => {
      if (
        !shouldFetchNextListingPage({
          hasMore,
          nextCursor,
          loading: loading || orderLoading,
          loadingMore: loadingMoreRef.current,
        })
      ) {
        return;
      }
      loadingMoreRef.current = true;
      setLoadingMore(true);
      const gen = loadGenRef.current;
      try {
        const page = await searchListingsPage(
          { ...apiFilters, cursor: nextCursor ?? undefined },
          accessToken,
        );
        // A sort/filter change started a new first page: drop this stale page.
        if (gen !== loadGenRef.current) return;
        setItems((prev) => mergeListingPages(prev, page.listings));
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch {
        // Keep the current page — a failed load-more must not wipe listings.
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }, [accessToken, apiFilters, hasMore, loading, nextCursor, orderLoading]);

    useEffect(() => {
      void loadFirstPage();
    }, [loadFirstPage]);

    useFocusEffect(
      useCallback(() => {
        const now = Date.now();
        if (now - lastCategoriesFocusAt.current >= MARKET_FOCUS_TTL_MS) {
          lastCategoriesFocusAt.current = now;
          void reloadCategories();
        }
        if (skipFirstFocusRef.current) {
          skipFirstFocusRef.current = false;
          return;
        }
        if (hasItemsRef.current || loadingRef.current) return;
        void loadFirstPage();
      }, [reloadCategories, loadFirstPage]),
    );

    useImperativeHandle(ref, () => ({
      refresh: () => loadFirstPage(),
    }));

    const activeParent = useMemo(
      () => categories.find((c) => c.id === activeParentId) ?? null,
      [categories, activeParentId],
    );
    const activeSub = useMemo(() => {
      if (!activeSubId || !activeParent) return null;
      return activeParent.children?.find((c) => c.id === activeSubId) ?? null;
    }, [activeParent, activeSubId]);

    const onApplyCategory = useCallback((sel: { parentId: string | null; subId: string | null }) => {
      setActiveParentId(sel.parentId);
      setActiveSubId(sel.subId);
    }, []);

    const categoryActive = activeParentId !== null;

    useEffect(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [activeParentId, activeSubId]);

    const filtered = useMemo(() => {
      let list = items.filter((l) => {
        if (l.country === 'EG') return false;
        if (showFeaturedOnly && !l.featured) return false;
        if (activeParent && !listingMatchesMarketSelection(l, activeParent, activeSub)) {
          return false;
        }
        // «القريب» is filtered by distance on the server; the region text filter is
        // only for a region/city picked in the region sheet.
        if (
          !nearbyActive &&
          !listingMatchesRegionSelection(l.arabicLocation || l.location || '', regionSelection)
        ) {
          return false;
        }
        return true;
      });

      // Server order is final for the radius feed (nearest / newest within radius) and
      // for oldest-first; re-ranking or promotion interleaving here would undo it.
      if (nearbyActive) return list;
      if (sortMode === 'oldest') return list;

      list = [...list].sort(compareListingBoostPriority);
      const ranked = interleavePromotedListings(list);
      // «بائع ذهبي»: inside a picked region, Gold sellers lead (paid pins stay on top).
      return regionSelection.type === 'all' ? ranked : goldSellersFirstInRegion(ranked);
    }, [items, showFeaturedOnly, activeParent, activeSub, regionSelection, sortMode, nearbyActive]);

    useEffect(() => {
      if (nearbyActive || regionSelection.type === 'all') return;
      if (!hasMore || loading || loadingMore) return;
      if (filtered.length >= 8) return;
      void loadNextPage();
    }, [filtered.length, hasMore, loadNextPage, loading, loadingMore, regionSelection.type, nearbyActive]);

    const cycleSort = useCallback(() => {
      // Invalidate in-flight pages and hide the previous order's rows behind the
      // loader; the apiFilters change then reloads page 1 in the new order.
      loadGenRef.current += 1;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoadFailed(false);
      const prev = sortModeRef.current;
      const next = toggleFeedSortMode(prev);
      sortModeRef.current = next;
      if (orderSwitchFromRef.current === next) {
        // Toggled back before the other order arrived: the kept rows already
        // match `next`, so show them again instead of waiting.
        orderSwitchFromRef.current = null;
        setOrderLoading(false);
      } else {
        orderSwitchFromRef.current = orderSwitchFromRef.current ?? prev;
        setOrderLoading(true);
      }
      setSortMode(next);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, []);

    const resetListForNewQuery = useCallback(() => {
      // New origin/radius/order: drop in-flight pages and show the skeleton until page 1.
      loadGenRef.current += 1;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoadFailed(false);
      // Old rows are hidden (not wiped) until the new first page lands.
      queryResetRef.current = true;
      setOrderLoading(true);
      setNextCursor(null);
      setHasMore(false);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, []);

    /** Apply a new «القريب» query; reloads only when the server params really change. */
    const applyNearby = useCallback(
      (next: NearbyState | null) => {
        const same =
          JSON.stringify(nearbyApiParams(next)) === JSON.stringify(nearbyApiParams(nearby));
        if (!same) resetListForNewQuery();
        setNearby(next);
      },
      [nearby, resetListForNewQuery],
    );

    const startNearby = useCallback(
      (next: NearbyState) => {
        setRegionSelection({ type: 'all' });
        applyNearby(next);
      },
      [applyNearby],
    );

    const onNearby = useCallback(async () => {
      if (nearby) {
        applyNearby(null);
        return;
      }
      if (nearbyBusyRef.current) return;
      nearbyBusyRef.current = true;
      setNearbyLocating(true);
      try {
        const res = await detectDeviceCity();
        if (res.status === 'ok') {
          startNearby(initialNearbyState({ kind: 'gps', lat: res.lat, lng: res.lng, city: res.city }));
          return;
        }
        // No permission / no fix / outside KSA: measure from «مدينتك» instead.
        setCityPickerMessage(
          res.status === 'denied'
            ? 'الموقع غير مفعّل — اختر مدينتك لعرض الإعلانات القريبة منها'
            : res.status === 'outside'
              ? 'موقعك خارج المملكة — اختر مدينة لعرض الإعلانات القريبة منها'
              : 'تعذّر تحديد موقعك — اختر مدينتك',
        );
        setCityPickerOpen(true);
      } finally {
        nearbyBusyRef.current = false;
        setNearbyLocating(false);
      }
    }, [nearby, applyNearby, startNearby]);

    const onPickNearbyCity = useCallback(
      (city: SaudiCityEntry) => {
        startNearby({
          ...(nearby ?? initialNearbyState({ kind: 'city', city })),
          origin: { kind: 'city', city },
        });
      },
      [nearby, startNearby],
    );

    const onNearbyChip = useCallback(
      (chip: NearbyChip) => {
        if (!nearby) return;
        applyNearby(applyNearbyChip(nearby, chip));
      },
      [nearby, applyNearby],
    );

    const onNearbyOriginPress = useCallback(() => {
      setCityPickerMessage(undefined);
      setCityPickerOpen(true);
    }, []);

    const onCityPickerUseLocation = useCallback(async () => {
      setNearbyLocating(true);
      try {
        const res = await detectDeviceCity({ useCache: false });
        if (res.status === 'ok') {
          setCityPickerOpen(false);
          startNearby({
            ...(nearby ?? initialNearbyState({ kind: 'gps', lat: res.lat, lng: res.lng, city: res.city })),
            origin: { kind: 'gps', lat: res.lat, lng: res.lng, city: res.city },
          });
        } else {
          setCityPickerMessage(
            res.status === 'denied'
              ? 'اسمح بالوصول للموقع من الإعدادات، أو اختر مدينتك'
              : 'تعذّر تحديد موقعك — اختر مدينتك',
          );
        }
      } finally {
        setNearbyLocating(false);
      }
    }, [nearby, startNearby]);

    const onRegionPress = useCallback(() => setRegionPickerOpen(true), []);
    const onNearbyPress = useCallback(() => {
      void onNearby();
    }, [onNearby]);
    const onSortPress = useCallback(() => {
      // Inside «القريب» the order chip switches nearest-first ↔ newest within the radius.
      if (nearby) {
        applyNearby({ ...nearby, nearestFirst: !nearby.nearestFirst });
        return;
      }
      cycleSort();
    }, [cycleSort, nearby, applyNearby]);
    const onCategoryPress = useCallback(() => setCategoryPickerOpen(true), []);

    const filterBar = useMemo(
      () => (
        <MarketFilterBar
          regionSelection={regionSelection}
          onRegionPress={onRegionPress}
          onNearbyPress={onNearbyPress}
          onSortPress={onSortPress}
          onCategoryPress={onCategoryPress}
          categoryActive={categoryActive}
          categoryPickerOpen={categoryPickerOpen}
          regionActive={regionPickerOpen}
          nearbyActive={nearbyActive || nearbyLocating}
          sortActive={nearby ? nearby.nearestFirst : sortMode !== 'newest'}
          sortLabel={nearby ? (nearby.nearestFirst ? 'الأقرب أولاً' : 'الأحدث') : feedSortLabelAr(sortMode)}
        />
      ),
      [
        regionSelection,
        onRegionPress,
        onNearbyPress,
        onSortPress,
        onCategoryPress,
        categoryActive,
        categoryPickerOpen,
        regionPickerOpen,
        nearbyActive,
        nearbyLocating,
        nearby,
        sortMode,
      ],
    );

    const nearbyBar = useMemo(
      () =>
        nearby ? (
          <NearbyFilterChips
            state={nearby}
            onChip={onNearbyChip}
            onOriginPress={onNearbyOriginPress}
          />
        ) : null,
      [nearby, onNearbyChip, onNearbyOriginPress],
    );

    const renderItem = useCallback(
      ({ item }: ListRenderItemInfo<Listing>) => (
        <ListingCard
          listing={item}
          variant="list"
          listMode="market"
          onPress={() => {
            trackPromotedClick(item);
            safePush({ pathname: '/listing/[id]', params: { id: item.id } }, undefined, router);
          }}
        />
      ),
      [router],
    );

    /** Paid promotion impressions: promoted rows that were really on screen (once per session). */
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        if (token.isViewable) trackPromotedImpression(token.item as Listing);
      }
    }).current;

    const ListSeparator = useCallback(
      () => <View style={[styles.listSeparator, { height: listMetrics.gap }]} />,
      [listMetrics.gap],
    );

    const ListHeader = useCallback(
      () => (
        <View style={variant === 'home' ? styles.homeHeaderStack : undefined}>
          {extraHeader}
          {variant === 'home' ? filterBar : null}
          {variant === 'home' ? nearbyBar : null}
        </View>
      ),
      [extraHeader, variant, filterBar, nearbyBar],
    );

    return (
      <View style={styles.root}>
        {variant === 'market' ? (
          <View style={styles.stickyChrome}>
            <MarketAppBar
              onSearch={() => safePush('/search', undefined, router)}
              onFilterPress={() => setRegionPickerOpen(true)}
              onFeaturedPress={() => setShowFeaturedOnly((v) => !v)}
              featuredActive={showFeaturedOnly}
            />
            {filterBar}
            {nearbyBar}
          </View>
        ) : null}

        <AppFlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={[styles.listContent, padTop ? { paddingTop: padTop } : null]}
          data={orderLoading ? EMPTY_LISTINGS : filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={PROMOTION_VIEWABILITY}
          ListHeaderComponent={ListHeader}
          ItemSeparatorComponent={ListSeparator}
          ListEmptyComponent={
            orderLoading || loading || (loadFailed && items.length === 0) ? (
              orderLoading || loading ? (
                // First load / sort switch: skeleton rows inside the same list,
                // same card size and separator as the real ListingCard rows.
                <SkeletonRegion style={[styles.skeletonList, { gap: listMetrics.gap }]}>
                  {Array.from({ length: skeletonCount }, (_, i) => (
                    <ListingCardSkeleton key={i} />
                  ))}
                </SkeletonRegion>
              ) : (
                <Stack gap="sm" align="center" style={styles.empty}>
                  <AppText variant="body" color="textMuted" align="center">
                    تعذّر تحميل الإعلانات
                  </AppText>
                  <Pressable
                    onPress={() => void loadFirstPage()}
                    accessibilityRole="button"
                    accessibilityLabel="إعادة المحاولة"
                    hitSlop={8}
                  >
                    <AppText variant="body" color="primary">
                      إعادة المحاولة
                    </AppText>
                  </Pressable>
                </Stack>
              )
            ) : (
              <Stack gap="md" align="center" style={styles.empty}>
                <AppText variant="heading2" align="center">
                  🔍
                </AppText>
                <AppText variant="body" color="textMuted" align="center">
                  {nearby
                    ? `لا توجد إعلانات ضمن ${nearby.radiusKm} كم من ${nearby.origin.city.nameAr}`
                    : 'لا توجد إعلانات مطابقة'}
                </AppText>
              </Stack>
            )
          }
          ListFooterComponent={
            <View style={styles.listFooter}>
              {loadingMore ? <ActivityIndicator color={colors.electric} /> : null}
            </View>
          }
          onScroll={onScroll}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            void loadNextPage();
          }}
          removeClippedSubviews={false}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={8}
        />

        <RegionCityPicker
          visible={regionPickerOpen}
          selection={regionSelection}
          onClose={() => setRegionPickerOpen(false)}
          onSelect={(selection) => {
            if (nearby) applyNearby(null);
            setRegionSelection(selection);
          }}
          onNearby={() => {
            if (!nearby) onNearbyPress();
          }}
          nearbyActive={nearbyActive}
        />

        <SaudiCityPickerSheet
          visible={cityPickerOpen}
          title="مدينتك"
          message={cityPickerMessage}
          selectedId={nearby?.origin.kind === 'city' ? nearby.origin.city.id : null}
          onClose={() => setCityPickerOpen(false)}
          onSelect={onPickNearbyCity}
          onUseLocation={() => void onCityPickerUseLocation()}
          locating={nearbyLocating}
          testID="nearby-city-picker"
        />

        <MarketCategoryPicker
          visible={categoryPickerOpen}
          categories={categories}
          selection={{ parentId: activeParentId, subId: activeSubId }}
          onClose={() => setCategoryPickerOpen(false)}
          onSelect={onApplyCategory}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  stickyChrome: {
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 2,
  },
  list: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 0,
  },
  /** Separates Quick Access (a section) from listing filter controls. */
  homeHeaderStack: {
    gap: spacing.lg,
  },
  listSeparator: {
    height: spacing.sm,
  },
  listFooter: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  empty: { paddingVertical: spacing.xxxl },
  /** Same vertical rhythm as rows + ItemSeparatorComponent. */
  skeletonList: { gap: spacing.sm },
});

export default MarketListingsFeed;
