import { ListingCardSkeleton, PostCardSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { ListingCard } from '@/components/feature/ListingCard';
import { useListingListMetrics } from '@/components/feature/useListingListMetrics';
import { PostItem } from '@/components/feature/PostItem';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useApp } from '@/hooks/useApp';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  BOOKMARKS_PAGE_SIZE,
  BOOKMARKS_TITLE,
  BOOKMARK_TABS,
  SAVED_SIGNED_OUT_TEXT,
  bookmarkEmptyText,
  bookmarkPagerIndex,
  bookmarkPagerOffset,
  resolveBookmarked,
  savedPostIdsNewestFirst,
} from '@/lib/bookmarks';
import { getListingFavoriteIds } from '@/lib/listingFavorite';
import { isHorizontalPagerRtl } from '@/lib/mediaViewerPaging';
import { getRtlRow } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { usePostFeedActions } from '@/lib/usePostFeedActions';
import { fetchListingById } from '@/services/listings';
import { fetchPostById } from '@/services/posts';
import type { Listing, Post } from '@/services/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { trackPromotedClick } from '@/lib/promotionTracking';

/**
 * "العلامات المرجعية": two tabs (المفضلة / المحفوظات) over a horizontal pager.
 * ONE state (`index`) drives the tab, the indicator and the pager position; a
 * swipe maps the settled physical offset back to that index RTL-aware
 * (lib/bookmarks bookmarkPagerIndex / bookmarkPagerOffset). Each page is its own
 * vertical list; listings and posts are never mixed.
 */
export default function BookmarksScreen() {
  const { width } = useWindowDimensions();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const pagerRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const rtl = isHorizontalPagerRtl();
  const count = BOOKMARK_TABS.length;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: index, duration: 180, useNativeDriver: true }).start();
  }, [index, progress]);

  /** Tap: select the tab and move the pager to that page's physical offset. */
  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      pagerRef.current?.scrollTo({ x: bookmarkPagerOffset(next, width, count, rtl), y: 0, animated: true });
    },
    [count, rtl, width],
  );

  /** Swipe: the settled offset decides the index (never an LTR-only formula). */
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(bookmarkPagerIndex(event.nativeEvent.contentOffset.x, width, count, rtl));
    },
    [count, rtl, width],
  );

  /** Layout / rotation: keep the pager on the selected page. */
  const positionPager = useCallback(() => {
    pagerRef.current?.scrollTo({
      x: bookmarkPagerOffset(indexRef.current, width, count, rtl),
      y: 0,
      animated: false,
    });
  }, [count, rtl, width]);

  // Initial position only; later moves go through positionPager / goTo.
  const initialOffset = useRef({ x: bookmarkPagerOffset(0, width, count, rtl), y: 0 }).current;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={BOOKMARKS_TITLE} showBack />
      <ScreenBody scroll={false} gutter={false}>
        <View style={[styles.tabs, getRtlRow()]} accessibilityRole="tablist">
          {BOOKMARK_TABS.map((tab, i) => {
            const active = index === i;
            const indicatorOpacity = progress.interpolate({
              inputRange: [0, 1],
              outputRange: i === 0 ? [1, 0] : [0, 1],
              extrapolate: 'clamp',
            });
            return (
              <Pressable
                key={tab.key}
                onPress={() => goTo(i)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <AppText variant="label" color={active ? 'textPrimary' : 'textMuted'}>
                  {tab.label}
                </AppText>
                <Animated.View
                  style={[
                    styles.tabIndicator,
                    { opacity: indicatorOpacity, transform: [{ scaleX: indicatorOpacity }] },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onLayout={positionPager}
          onContentSizeChange={positionPager}
          contentOffset={initialOffset}
          scrollEventThrottle={16}
          style={[styles.pager, { direction: rtl ? 'rtl' : 'ltr' }]}
        >
          {BOOKMARK_TABS.map((tab) => (
            <View key={tab.key} style={[styles.page, { width }]}>
              {tab.key === 'favorites' ? <FavoritesPage /> : <SavedPage />}
            </View>
          ))}
        </ScrollView>
      </ScreenBody>
    </Screen>
  );
}

/** Cache-first resolution of bookmarked ids with lazy per-id fetches, one page at a time. */
function useResolvedBookmarks<T extends { id: string }>(
  ids: readonly string[] | null,
  cached: readonly T[],
  fetchOne: (id: string) => Promise<T | null>,
) {
  const [limit, setLimit] = useState(BOOKMARKS_PAGE_SIZE);
  const [fetched, setFetched] = useState<Record<string, T | null>>({});
  const [pending, setPending] = useState(0);
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { items, missing } = useMemo(
    () => resolveBookmarked(ids ?? [], cached, fetched, limit),
    [ids, cached, fetched, limit],
  );

  useEffect(() => {
    const todo = missing.filter((id) => !requested.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => requested.current.add(id));
    setPending((n) => n + 1);
    InteractionManager.runAfterInteractions(() => {
      void Promise.all(todo.map((id) => fetchOne(id).catch(() => null)))
        .then((rows) => {
          if (!mounted.current) return;
          setFetched((prev) => {
            const next = { ...prev };
            todo.forEach((id, i) => {
              next[id] = rows[i] ?? null;
            });
            return next;
          });
        })
        .finally(() => {
          if (mounted.current) setPending((n) => Math.max(0, n - 1));
        });
    });
  }, [missing, fetchOne]);

  const hasMore = limit < (ids?.length ?? 0);
  const loadMore = useCallback(() => {
    if (hasMore && pending === 0) setLimit((n) => n + BOOKMARKS_PAGE_SIZE);
  }, [hasMore, pending]);

  return {
    items,
    loading: ids === null || (items.length === 0 && pending > 0),
    loadingMore: items.length > 0 && pending > 0,
    loadMore,
  };
}

function FavoritesPage() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { listings } = useApp();
  const [ids, setIds] = useState<string[] | null>(null);

  // Re-read on focus: a listing may have been (un)favorited from its detail page.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getListingFavoriteIds().then((next) => {
        if (active) setIds(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const { items, loading, loadingMore, loadMore } = useResolvedBookmarks<Listing>(
    ids,
    listings,
    fetchListingById,
  );

  // Same card, props and spacing as the Home feed (MarketListingsFeed).
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

  // Card gap scales with the screen width, same as the Home feed.
  const listMetrics = useListingListMetrics();
  const ListSeparator = useCallback(
    () => <View style={[styles.listSeparator, { height: listMetrics.gap }]} />,
    [styles.listSeparator, listMetrics.gap],
  );

  return (
    <AppFlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={ListSeparator}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      ListEmptyComponent={
        loading ? (
          <BookmarksLoading kind="listings" />
        ) : (
          <BookmarksEmpty text={bookmarkEmptyText('favorites')} />
        )
      }
      ListFooterComponent={
        <View style={styles.listFooter}>
          {loadingMore ? <ActivityIndicator color={colors.electric} /> : null}
        </View>
      }
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
    />
  );
}

function SavedPage() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const { posts, bookmarkedPosts } = useApp();
  const { enrich, bind, observe } = usePostFeedActions();
  const observeRef = useRef(observe);
  observeRef.current = observe;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 800 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: Post }> }) => {
      for (const token of viewableItems) {
        if (token.item?.id) observeRef.current(token.item.id);
      }
    },
  ).current;

  // Unsaving (existing toggleBookmark) drops the id from bookmarkedPosts, so the row leaves the list.
  const ids = useMemo(
    () => (isAuthenticated ? savedPostIdsNewestFirst(bookmarkedPosts) : []),
    [isAuthenticated, bookmarkedPosts],
  );
  const { items, loading, loadingMore, loadMore } = useResolvedBookmarks<Post>(ids, posts, fetchPostById);

  // Same post component and props as the Community feed (app/(tabs)/posts.tsx).
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => {
      const post = enrich(item);
      return <PostItem post={post} {...bind(post)} />;
    },
    [enrich, bind],
  );

  if (!isAuthenticated) {
    return (
      <BookmarksEmpty
        text={SAVED_SIGNED_OUT_TEXT}
        action={
          <SarhButton title="تسجيل الدخول" onPress={() => safePush('/auth/phone', undefined, router)} />
        }
      />
    );
  }

  return (
    <AppFlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      ListEmptyComponent={
        loading ? (
          <BookmarksLoading kind="posts" />
        ) : (
          <BookmarksEmpty text={bookmarkEmptyText('saved')} />
        )
      }
      ListFooterComponent={
        <View style={styles.listFooter}>
          {loadingMore ? <ActivityIndicator color={colors.electricBright} /> : null}
        </View>
      }
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={7}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
    />
  );
}

/** First load: skeleton rows shaped like the tab's real rows (offer cards / posts). */
function BookmarksLoading({ kind }: { kind: 'listings' | 'posts' }) {
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const listMetrics = useListingListMetrics();
  return kind === 'listings' ? (
    <SkeletonRegion style={[styles.skeletonListings, { gap: listMetrics.gap }]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  ) : (
    <SkeletonRegion>
      {[false, true, false].map((withMedia, i) => (
        <PostCardSkeleton key={i} withMedia={withMedia} />
      ))}
    </SkeletonRegion>
  );
}

function BookmarksEmpty({ text, action }: { text: string; action?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  return (
    <Stack gap="md" align="center" style={styles.empty}>
      <AppIcon name="bookmark-outline" size={28} color={colors.textMuted} />
      <AppText variant="body" color="textMuted" align="center">
        {text}
      </AppText>
      {action}
    </Stack>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tabs: {
      alignItems: 'stretch',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingBottom: spacing.sm,
      position: 'relative',
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      width: 24,
      height: 2,
      borderRadius: 999,
      backgroundColor: colors.electric,
    },
    pager: {
      flex: 1,
    },
    page: {
      flex: 1,
    },
    listContent: {
      flexGrow: 1,
      paddingTop: spacing.sm,
    },
    listSeparator: {
      height: spacing.sm,
    },
    skeletonListings: {
      gap: spacing.sm,
    },
    listFooter: {
      alignItems: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: spacing.xxxl,
      paddingHorizontal: spacing.lg,
    },
  });
}