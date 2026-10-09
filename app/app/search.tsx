// SAFAT — Unified Search Screen (البحث)
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { ListingCard } from '@/components/feature/ListingCard';
import { MinistryServiceCard } from '@/components/feature/MinistryServiceCard';
import { PostItem } from '@/components/feature/PostItem';
import { EditorialStoryViewer } from '@/components/feature/EditorialStoryViewer';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { HomeAppBar, SHELL_IDENTITY_COLLAPSE_H, shellIdentityStackH } from '@/components/ui/HomeAppBar';
import { useAuth } from '@/contexts/AuthContext';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { openPostDetail } from '@/lib/openPost';
import { safePush } from '@/lib/safeNavigate';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { TrendingTopicRow } from '@/components/feature/TrendingTopicRow';
import {
  ListingCardSkeleton,
  NewsCardSkeleton,
  PostCardSkeleton,
  SectionTitleSkeleton,
  ServiceCardSkeleton,
  SkeletonRegion,
  ThumbRowSkeleton,
  TrendingListSkeleton,
  UserIdentityRowSkeleton,
} from '@/components/ui/skeleton';
import {
  EXPLORE_TRENDING_PREVIEW,
  TRENDING_SECTION_TITLE,
  toTrendingRows,
  type TrendingRow,
} from '@/lib/searchTrending';
import { orderExploreSections } from '@/lib/searchExplore';
import { AppText, SarhBackButton, SarhChipRow, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { GAP } from '@/design-system/layout/metrics';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { useApp, useAppUser } from '@/hooks/useApp';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { fetchEditorialStories, type EditorialStory } from '@/services/editorialStories';
import {
  fetchOfficialServices,
  previewOfficialServices,
  type OfficialService,
} from '@/services/officialServices';
import {
  fetchSearchExplore,
  fetchSearchTrending,
  type ExploreAccountItem,
  type ExploreNewsItem,
  type ExploreSection as ExploreFeedSection,
  type ExploreSupplierItem,
  type ExploreTrendingItem,
} from '@/services/searchDiscovery';
import {
  fetchSearchSuggestions,
  mapListingFromSearch,
  mapPostFromSearch,
  unifiedSearch,
  type SearchContentType,
  type SearchGroup,
  type SearchResultItem,
} from '@/services/unifiedSearch';
import { ambientShadow, ds } from '@/constants/designSystem';
import { functional, space } from '@/design-system';
import { type ThemeColors } from '@/constants/theme';
import { useCollapsibleSearchHeader } from '@/hooks/useCollapsibleSearchHeader';
import { useSwipeTabPager } from '@/hooks/useSwipeTabPager';
import { SwipeTabPager } from '@/components/ui/SwipeTabPager';
import { SwipeTabIndicator } from '@/components/ui/SwipeTabIndicator';
import { HEADER_TAB_INDICATOR_OVERHANG, HEADER_TAB_INDICATOR_THICKNESS } from '@/lib/tabPager';
import { resolveAppFontFace } from '@/constants/fonts';
import { useRevealActiveTab, useTabLayouts } from '@/hooks/useTabLayouts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RECENT_KEY = 'safat_recent_searches';
const MIN_QUERY = 2;

type SearchFilter = SearchContentType;

const RESULT_SECTIONS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'الأحدث' },
  { id: 'users', label: 'الأشخاص' },
  { id: 'listings', label: 'الإعلانات' },
  { id: 'posts', label: 'المنشورات' },
  { id: 'news', label: 'الأخبار' },
  { id: 'services', label: 'الخدمات' },
];

/**
 * X-style tab spacing: fit-content tabs with 16pt on each side of the label (no chip gap),
 * scrolling when they overflow.
 */
const TAB_SIDE_PAD = 16;
/**
 * Result-tab underline: one indicator that slides with the swipe and spans the
 * label + HEADER_TAB_INDICATOR_OVERHANG each side, X-style.
 */
const RESULT_TAB_INDICATOR_INSET = TAB_SIDE_PAD - HEADER_TAB_INDICATOR_OVERHANG;
/** Results for a (query, filter) stay fresh this long: swiping back never refetches. */
const RESULT_CACHE_TTL_MS = 60_000;
/** A failed (query, tab) is not re-requested on every swipe back; «إعادة المحاولة» forces it. */
const RESULT_ERROR_TTL_MS = 15_000;
const RESULT_CACHE_MAX = 40;
/** Swiping through tabs: only the tab the user stops on is requested. */
const TAB_SETTLE_FETCH_DELAY_MS = 250;

type ExploreSection = 'explore' | 'trending' | 'news' | 'services';

/** Full ministry services list (no longer in the sidebar; reached from Search «الخدمات»). */
const MINISTRY_SERVICES_HREF = '/ministry?tab=services';

const EXPLORE_SECTIONS: { id: ExploreSection; label: string }[] = [
  { id: 'explore', label: 'استكشف' },
  { id: 'trending', label: 'الأكثر تداولاً' },
  { id: 'news', label: 'الأخبار' },
  { id: 'services', label: 'الخدمات' },
];

type SearchScreenProps = {
  variant?: 'stack' | 'tab';
};

type SearchPhase = 'home' | 'mode' | 'results';

export default function SearchScreen({ variant = 'stack' }: SearchScreenProps) {
  const { colors, scheme } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors: c, scheme: s }) => createStyles(c, s));
  const router = useRouter();
  const navigation = useNavigation();
  const { q: qParam } = useLocalSearchParams<{ q?: string }>();
  const { setTabBarForceHidden, onChromeScroll, setChromeVisible } = useAppChromeScroll();
  const { me } = useAppUser();
  const { likedPosts, bookmarkedPosts, repostedPosts, toggleLike, toggleRepost, toggleBookmark, deletePost } = useApp();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const isTab = variant === 'tab';
  const [headerH, setHeaderH] = useState(() => shellIdentityStackH(insets.top) + 48);
  const headerHRef = useRef(headerH);
  headerHRef.current = headerH;
  const headerMeasuredRef = useRef(false);
  const scrollingRef = useRef(false);
  const {
    scrollY,
    translateY,
    identityOpacity,
    resetCollapse,
  } = useCollapsibleSearchHeader(SHELL_IDENTITY_COLLAPSE_H);
  const [section, setSection] = useState<ExploreSection>('explore');
  const exploreIndex = Math.max(0, EXPLORE_SECTIONS.findIndex((item) => item.id === section));
  const { layouts: exploreLayouts, onTabLayout: onExploreTabLayout } = useTabLayouts(EXPLORE_SECTIONS.length);
  const { scrollRef: exploreTabsRef, rowProps: exploreTabsRowProps } = useRevealActiveTab(
    exploreIndex,
    exploreLayouts,
  );
  const displayName = isAuthenticated
    ? me.arabicName || me.displayName || me.username || 'حسابي'
    : 'ضيف';

  const openSidebar = useCallback(() => {
    if (!isAuthenticated) {
      safePush('/auth/phone', undefined, router);
      return;
    }
    safePush('/sidebar', undefined, router);
  }, [isAuthenticated, router]);

  const initialQuery = typeof qParam === 'string' ? qParam : '';
  const [query, setQuery] = useState(initialQuery);
  const [phase, setPhase] = useState<SearchPhase>(() => {
    if (initialQuery.trim().length >= MIN_QUERY) return 'results';
    return isTab ? 'home' : 'mode';
  });
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const { width: windowWidth } = useWindowDimensions();
  /**
   * Result tabs ride the /bookmarks swipe pager: one index = the selected filter.
   * A swipe settles once (onMomentumScrollEnd) exactly like a tab press, so the
   * query, debounce and results are kept and no extra request is made mid-swipe.
   */
  const resultPager = useSwipeTabPager({
    count: RESULT_SECTIONS.length,
    width: windowWidth,
    // UI-thread progress (SwipeTabIndicator is transform-only); the filter settles on momentum end.
    nativeDriver: true,
  });
  const { goTo: goToResultTab, jumpTo: jumpToResultTab } = resultPager;
  const filter: SearchFilter = RESULT_SECTIONS[resultPager.index]?.id ?? 'all';
  /** Measured result tabs: one indicator slides under them with the pager drag. */
  const { layouts: resultTabLayouts, onTabLayout: onResultTabLayout } = useTabLayouts(RESULT_SECTIONS.length);
  const { scrollRef: resultTabsRef, rowProps: resultTabsRowProps } = useRevealActiveTab(
    resultPager.index,
    resultTabLayouts,
  );
  const [page, setPage] = useState(1);

  const selectSection = useCallback((next: ExploreSection) => {
    setSection(next);
  }, []);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; kind: string }>>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exploreSections, setExploreSections] = useState<ExploreFeedSection[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [trendingItems, setTrendingItems] = useState<ExploreTrendingItem[]>([]);
  const [trendingLoaded, setTrendingLoaded] = useState(false);
  const [stories, setStories] = useState<EditorialStory[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [services, setServices] = useState<OfficialService[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const searchSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** First page per (query, filter): swiping back to a tab shows it without a request. */
  const resultCache = useRef(
    new Map<string, { at: number; groups: SearchGroup[] } | { at: number; error: string }>(),
  );
  const lastRequestRef = useRef<{ q: string; filter: SearchFilter } | null>(null);
  /**
   * In-flight network requests by query. A tab hop does not cancel the previous tab's request
   * (it lands in the service cache, so swiping back is free); a new query or unmount does.
   */
  const inflightRef = useRef(new Set<{ q: string; ac: AbortController }>());
  useEffect(() => {
    const inflight = inflightRef.current;
    return () => {
      for (const entry of inflight) entry.ac.abort();
      inflight.clear();
    };
  }, []);
  const loadingMoreRef = useRef(false);
  const pageRef = useRef(1);
  const filterRef = useRef(filter);
  const queryRef = useRef(debouncedQuery);
  filterRef.current = filter;
  queryRef.current = debouncedQuery;
  pageRef.current = page;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      Keyboard.dismiss();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((val) => {
        if (val) setRecentSearches(JSON.parse(val));
      })
      .catch(() => {});
  }, []);

  // Idle Explore: one aggregated request (no users-list / trending / news / services storm)
  useEffect(() => {
    let cancelled = false;
    setExploreLoading(true);
    void fetchSearchExplore()
      .then((data) => {
        if (!cancelled) setExploreSections(data.sections ?? []);
      })
      .finally(() => {
        if (!cancelled) setExploreLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load discovery tabs on first visit
  useEffect(() => {
    let cancelled = false;
    if (section === 'trending' && !trendingLoaded) {
      void fetchSearchTrending()
        .then((data) => {
          if (cancelled) return;
          setTrendingItems(data.trending ?? []);
          setTrendingLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setTrendingLoaded(true);
        });
    }
    if (section === 'news' && !newsLoaded) {
      void fetchEditorialStories()
        .then((data) => {
          if (cancelled) return;
          setStories(data);
          setNewsLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setNewsLoaded(true);
        });
    }
    if (section === 'services' && !servicesLoaded) {
      void fetchOfficialServices()
        .then((result) => {
          if (cancelled) return;
          setServices(previewOfficialServices(result.services, 8));
          setServicesLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setServicesLoaded(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [section, trendingLoaded, newsLoaded, servicesLoaded]);

  // Ensure editorial stories exist for news result viewer (without mounting storm).
  // One request at a time: a groups / filter change mid-flight must not cancel and refetch it.
  const storiesInflightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (newsLoaded || storiesInflightRef.current) return;
    if (filter !== 'news' && !groups.some((g) => g.type === 'news' && g.items.length > 0)) {
      return;
    }
    storiesInflightRef.current = true;
    void fetchEditorialStories()
      .then((data) => {
        if (!mountedRef.current) return;
        setStories(data);
        setNewsLoaded(true);
      })
      .catch(() => {
        if (mountedRef.current) setNewsLoaded(true);
      })
      .finally(() => {
        storiesInflightRef.current = false;
      });
  }, [filter, groups, newsLoaded]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY) {
      setSuggestions([]);
      setGroups([]);
      setError(null);
      setLoading(false);
      setPage(1);
      return;
    }

    const ac = new AbortController();
    fetchSearchSuggestions(debouncedQuery, 8, ac.signal)
      .then((items) => {
        if (ac.signal.aborted) return;
        setSuggestions(items);
      })
      .catch(() => {});

    return () => ac.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    const next = typeof qParam === 'string' ? qParam : '';
    if (next && next !== queryRef.current) {
      setQuery(next);
      if (next.trim().length >= MIN_QUERY) setPhase('results');
    }
  }, [qParam]);

  const runSearch = useCallback((nextPage: number, append: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const seq = ++searchSeq.current;

    if (debouncedQuery.length < MIN_QUERY) {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return () => ac.abort();
    }

    const cacheKey = `${debouncedQuery}\u0000${filter}`;
    if (!append && nextPage === 1) {
      const hit = resultCache.current.get(cacheKey);
      const fresh =
        hit && Date.now() - hit.at < ('error' in hit ? RESULT_ERROR_TTL_MS : RESULT_CACHE_TTL_MS);
      if (hit && fresh) {
        if ('error' in hit) {
          setGroups([]);
          setError(hit.error);
        } else {
          setGroups(hit.groups);
          setError(null);
        }
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
        return () => ac.abort();
      }
    }

    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    // Same query, another tab (a swipe / tap): wait a beat so tabs passed through are never requested.
    const last = lastRequestRef.current;
    const tabHop = !append && last != null && last.q === debouncedQuery && last.filter !== filter;
    lastRequestRef.current = { q: debouncedQuery, filter };
    const delay = tabHop ? TAB_SETTLE_FETCH_DELAY_MS : 0;

    new Promise<void>((resolve, reject) => {
      if (delay === 0) return resolve();
      const timer = setTimeout(resolve, delay);
      ac.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })
      .then(() => {
        for (const entry of inflightRef.current) {
          if (entry.q !== debouncedQuery) {
            entry.ac.abort();
            inflightRef.current.delete(entry);
          }
        }
        const net = { q: debouncedQuery, ac: append ? ac : new AbortController() };
        inflightRef.current.add(net);
        return unifiedSearch({
          q: debouncedQuery,
          type: filter,
          page: nextPage,
          limit: filter === 'all' ? 8 : 20,
          signal: net.ac.signal,
        }).finally(() => inflightRef.current.delete(net));
      })
      .then((res) => {
        if (seq !== searchSeq.current) return;
        if (!append && nextPage === 1) {
          const cache = resultCache.current;
          cache.delete(cacheKey);
          cache.set(cacheKey, { at: Date.now(), groups: res.groups });
          // Bounded: drop the oldest entries.
          while (cache.size > RESULT_CACHE_MAX) cache.delete(cache.keys().next().value as string);
        }
        setGroups((prev) => {
          if (!append) return res.groups;
          const byType = new Map(prev.map((g) => [g.type, g]));
          for (const group of res.groups) {
            const current = byType.get(group.type);
            if (!current) {
              byType.set(group.type, group);
              continue;
            }
            const seen = new Set(current.items.map((item) => item.id));
            byType.set(group.type, {
              ...group,
              items: [
                ...current.items,
                ...group.items.filter((item) => !seen.has(item.id)),
              ],
            });
          }
          return [...byType.values()];
        });
      })
      .catch((err: unknown) => {
        if (seq !== searchSeq.current) return;
        if ((err as { name?: string })?.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'تعذر إتمام البحث';
        if (!append && nextPage === 1) {
          resultCache.current.delete(cacheKey);
          resultCache.current.set(cacheKey, { at: Date.now(), error: message });
        }
        setError(message);
      })
      .finally(() => {
        if (seq !== searchSeq.current) return;
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      });

    return () => ac.abort();
  }, [debouncedQuery, filter]);

  useEffect(() => {
    if (phase !== 'results') {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return;
    }
    setPage(1);
    return runSearch(1, false);
  }, [runSearch, phase]);

  const saveRecent = useCallback((searches: string[]) => {
    setRecentSearches(searches);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(searches)).catch(() => {});
  }, []);

  const addRecentSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (trimmed.length < MIN_QUERY) return;
      const updated = [trimmed, ...recentSearches.filter((r) => r !== trimmed)].slice(0, 10);
      saveRecent(updated);
    },
    [recentSearches, saveRecent],
  );

  const applyQuery = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (trimmed.length < MIN_QUERY) return;
      setQuery(trimmed);
      addRecentSearch(trimmed);
      setPhase('results');
      resetCollapse();
      Keyboard.dismiss();
    },
    [addRecentSearch, resetCollapse],
  );

  const goHome = useCallback(() => {
    abortRef.current?.abort();
    setPhase('home');
    setQuery('');
    setSuggestions([]);
    setGroups([]);
    setError(null);
    jumpToResultTab(0);
    setPage(1);
    setLoading(false);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    resetCollapse();
    Keyboard.dismiss();
  }, [jumpToResultTab, resetCollapse]);

  const enterMode = useCallback(() => {
    setPhase((current) => (current === 'home' ? 'mode' : current));
    resetCollapse();
  }, [resetCollapse]);

  const onSessionBack = useCallback(() => {
    if (isTab) {
      goHome();
      return;
    }
    router.back();
  }, [goHome, isTab, router]);

  const hasQuery = query.trim().length > 0;
  const canSearch = debouncedQuery.length >= MIN_QUERY;
  const collapseEnabled = phase === 'home' || phase === 'results';
  const hideTabBar = isTab && phase !== 'home';
  /**
   * Fixed overlay header + static content inset: the collapse is a translateY of the whole
   * header (native driver). No per-frame height / paddingTop (layout) animation any more.
   */
  const bodyContentStyle = useMemo(
    () => ({ paddingTop: headerH + (collapseEnabled ? GAP.md : 0) }),
    [collapseEnabled, headerH],
  );
  const visibleTabBarStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      height: ds.tabBar.height + Math.max(insets.bottom, ds.tabBar.marginBottom),
    }),
    [insets.bottom],
  );

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!isTab) return;
    setTabBarForceHidden(hideTabBar);
    if (!hideTabBar) setChromeVisible(true);
    navigation.setOptions({
      tabBarStyle: hideTabBar
        ? { display: 'none', height: 0, overflow: 'hidden' }
        : visibleTabBarStyle,
    });
  }, [hideTabBar, isTab, navigation, setChromeVisible, setTabBarForceHidden, visibleTabBarStyle]);

  useFocusEffect(
    useCallback(() => {
      if (!isTab) return undefined;
      const hidden = phaseRef.current !== 'home';
      setTabBarForceHidden(hidden);
      if (!hidden) setChromeVisible(true);
      navigation.setOptions({
        tabBarStyle: hidden
          ? { display: 'none', height: 0, overflow: 'hidden' }
          : visibleTabBarStyle,
      });
      return () => {
        setTabBarForceHidden(false);
        navigation.setOptions({ tabBarStyle: visibleTabBarStyle });
      };
    }, [isTab, navigation, setChromeVisible, setTabBarForceHidden, visibleTabBarStyle]),
  );

  useEffect(() => {
    if (!isTab) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'home') return false;
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [goHome, isTab, phase]);

  useEffect(() => {
    headerMeasuredRef.current = false;
  }, [phase]);

  const onChromeLayout = useCallback((height: number) => {
    const next = Math.round(height);
    if (!next) return;
    // Overlay height is animated. Measuring inside the clip during scroll
    // feeds headerH back into paddingFor and makes the header jitter.
    if (scrollingRef.current && headerMeasuredRef.current) return;
    if (headerMeasuredRef.current && next <= headerHRef.current) return;
    if (headerMeasuredRef.current && Math.abs(headerHRef.current - next) < 2) return;
    headerMeasuredRef.current = true;
    headerHRef.current = next;
    setHeaderH(next);
  }, []);

  const onScrollIdle = useCallback(() => {
    scrollingRef.current = false;
  }, []);

  const visibleGroups = useMemo(() => {
    if (filter === 'all') return groups;
    return groups.filter((g) => g.type === filter);
  }, [groups, filter]);

  const latestItems = useMemo(() => {
    return groups
      .flatMap((group) => group.items)
      .slice()
      .sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        const left = a.createdAt ? Date.parse(a.createdAt) : 0;
        const right = b.createdAt ? Date.parse(b.createdAt) : 0;
        return right - left;
      });
  }, [groups]);

  const totalResults = useMemo(() => {
    if (filter === 'all') return latestItems.length;
    return visibleGroups.reduce((n, g) => n + g.items.length, 0);
  }, [filter, latestItems.length, visibleGroups]);

  const hasMore = filter !== 'all' && visibleGroups.some((g) => g.hasMore);

  const loadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !hasMore || !canSearch) return;
    const next = pageRef.current + 1;
    setPage(next);
    runSearch(next, true);
  }, [canSearch, hasMore, loading, runSearch]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  /** JS side of the scroll (scrollY itself is native-driven via ScreenBody nativeScrollY). */
  const onBodyScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollingRef.current = true;
      onChromeScroll(event);
      if (phaseRef.current !== 'results') return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 180) {
        loadMoreRef.current();
      }
    },
    [onChromeScroll],
  );

  const retrySearch = useCallback(() => {
    resultCache.current.delete(`${debouncedQuery}\u0000${filter}`);
    setPage(1);
    runSearch(1, false);
  }, [debouncedQuery, filter, runSearch]);

  const resultFrame = useCallback(
    (type: SearchResultItem['type']) => {
      if (type === 'listings') return styles.listingResult;
      if (type === 'posts') return styles.postResult;
      return [styles.insetResult, { paddingHorizontal: gutter }];
    },
    [gutter, styles],
  );

  const renderResult = (item: SearchResultItem) => {
    switch (item.type) {
      case 'listings': {
        const listing = mapListingFromSearch(item.data);
        if (!listing) return null;
        return (
          <ListingCard
            listing={listing}
            variant="list"
            listMode="market"
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
          />
        );
      }
      case 'news': {
        const storyIndex = stories.findIndex((story) => story.id === item.id);
        return (
          <Pressable
            style={styles.newsCard}
            onPress={() => {
              if (storyIndex >= 0) setViewerIndex(storyIndex);
              else router.push('/news' as never);
            }}
          >
            {item.imageUrl ? (
              <Image source={uriSource(cloudinaryFitUrl(item.imageUrl, 'wide'))} style={styles.newsImage} contentFit="cover" />
            ) : null}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={styles.newsGradient}
            />
            <AppText
              variant="heading3"
              numberOfLines={2}
              style={[styles.newsTitle, { color: functional.onPrimary }]}
            >
              {item.title}
            </AppText>
          </Pressable>
        );
      }
      case 'services': {
        const data = item.data as {
          category?: string;
          description?: string;
          icon?: string;
          externalUrl?: string;
        };
        const mapped: OfficialService = {
          id: item.id,
          title: item.title,
          description: String(data.description ?? ''),
          category: String(data.category ?? ''),
          icon: String(data.icon ?? ''),
          externalUrl: String(data.externalUrl ?? ''),
          active: true,
          createdAt: item.createdAt ?? '',
          updatedAt: item.createdAt ?? '',
        };
        return (
          <MinistryServiceCard
            service={mapped}
            onPress={() =>
              router.push({ pathname: '/ministry/services/[id]', params: { id: item.id } } as never)
            }
          />
        );
      }
      case 'users': {
        const user = item.data as {
          id?: string;
          username?: string;
          arabicName?: string;
          displayName?: string;
          avatar?: string;
          verified?: boolean;
          verifiedTier?: string | null;
        };
        return (
          <UserIdentityRow
            avatarUri={user.avatar ?? item.imageUrl}
            displayName={user.arabicName || user.displayName || user.username || item.title}
            username={user.username}
            verified={user.verified}
            verifiedTier={user.verifiedTier}
            avatarSize={USER_IDENTITY.listAvatarSize}
            avatarRadius={USER_IDENTITY.listAvatarRadius}
            avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
            nameLines={2}
            onPress={() => router.push({ pathname: '/users/[id]', params: { id: item.id } } as never)}
            style={styles.userRow}
          />
        );
      }
      case 'posts': {
        const post = mapPostFromSearch(item.data);
        if (!post) return null;
        return (
          <PostItem
            post={{
              ...post,
              liked: likedPosts.has(post.id),
              bookmarked: bookmarkedPosts.has(post.id),
              reposted: repostedPosts.has(post.id),
            }}
            onPress={() => openPostDetail(router, post.id)}
            onLike={() => requireAuth(isAuthenticated, 'الإعجاب') && void toggleLike(post.id)}
            onRepost={() => requireAuth(isAuthenticated, 'إعادة النشر') && void toggleRepost(post.id)}
            onComment={() => openPostDetail(router, post.id, { focusComment: isAuthenticated })}
            onBookmark={() => requireAuth(isAuthenticated, 'الحفظ') && toggleBookmark(post.id)}
            onShare={() => sharePost(post)}
            onMenu={() => showPostMenu(post, me, router, deletePost, isAuthenticated)}
          />
        );
      }
      default:
        return null;
    }
  };

  const onSearchFocus = useCallback(() => {
    if (phaseRef.current === 'home') enterMode();
  }, [enterMode]);

  const searchField = (
    <SarhInput
      value={query}
      onChangeText={setQuery}
      placeholder="بحث"
      autoFocus={!isTab}
      returnKeyType="search"
      onFocus={onSearchFocus}
      onSubmitEditing={() => {
        Keyboard.dismiss();
        applyQuery(query);
      }}
      leadingIcon="search"
      size="compact"
      trailingIcon={
        loading && canSearch ? (
          <ActivityIndicator size="small" color={colors.electricBright} />
        ) : hasQuery ? (
          'close-circle'
        ) : undefined
      }
      onTrailingPress={hasQuery && !(loading && canSearch) ? () => setQuery('') : undefined}
      shape="pill"
      accessibilityRole="search"
      accessibilityLabel="بحث"
      containerStyle={styles.inputFlex}
    />
  );

  const exploreTabs = (
    <SarhChipRow
      contentPaddingHorizontal={Math.max(0, gutter - TAB_SIDE_PAD)}
      style={styles.sectionRow}
      contentContainerStyle={styles.tabRowContent}
      scrollRef={exploreTabsRef}
      scrollProps={exploreTabsRowProps}
    >
      {EXPLORE_SECTIONS.map((item, index) => {
        const active = section === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => selectSection(item.id)}
            onLayout={(event) => onExploreTabLayout(index, event)}
            style={styles.sectionTab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <View style={styles.sectionTabLabelWrap}>
              <AppText
                variant="body"
                color={active ? 'textPrimary' : 'textSecondary'}
                style={active ? styles.tabLabelActive : undefined}
                numberOfLines={1}
              >
                {item.label}
              </AppText>
              {active ? <View style={styles.tabIndicator} /> : null}
            </View>
          </Pressable>
        );
      })}
    </SarhChipRow>
  );

  const resultTabs = (
    <SarhChipRow
      contentPaddingHorizontal={Math.max(0, gutter - TAB_SIDE_PAD)}
      style={styles.filterRowWrap}
      contentContainerStyle={[styles.filterRowContent, styles.tabRowContent]}
      scrollRef={resultTabsRef}
      scrollProps={resultTabsRowProps}
    >
      {RESULT_SECTIONS.map((item, index) => {
        const active = filter === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => goToResultTab(index)}
            onLayout={(event) => onResultTabLayout(index, event)}
            style={styles.resultTab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <AppText
              variant="body"
              color={active ? 'textPrimary' : 'textSecondary'}
              style={active ? styles.tabLabelActive : undefined}
              numberOfLines={1}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
      <SwipeTabIndicator
        progress={resultPager.progress}
        layouts={resultTabLayouts}
        count={RESULT_SECTIONS.length}
        inset={RESULT_TAB_INDICATOR_INSET}
        color={colors.textPrimary}
      />
    </SarhChipRow>
  );

  const chromeTabs = hasQuery ? resultTabs : exploreTabs;

  const modeIdle = (
    <Stack gap="md" style={{ paddingHorizontal: gutter }}>
      {query.trim().length > 0 && query.trim().length < MIN_QUERY ? (
        <AppText variant="caption" color="textMuted" align="center">
          اكتب {MIN_QUERY} أحرف على الأقل للبحث
        </AppText>
      ) : null}

      {recentSearches.length > 0 ? (
        <Stack gap="sm">
          <Row justify="between" align="center">
            <AppText variant="heading3">البحث الأخير</AppText>
            <Pressable onPress={() => saveRecent([])} accessibilityRole="button" accessibilityLabel="مسح الكل">
              <AppText variant="caption" color="primary">مسح الكل</AppText>
            </Pressable>
          </Row>
          {recentSearches.map((term) => (
            <Pressable key={term} onPress={() => applyQuery(term)}>
              <Row gap="md" align="center" style={styles.recentRow}>
                <AppIcon name="time-outline" size={16} color={colors.textMuted} />
                <AppText variant="body" color="textSecondary" style={styles.flex}>
                  {term}
                </AppText>
                <Pressable
                  onPress={() => saveRecent(recentSearches.filter((r) => r !== term))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="حذف"
                >
                  <AppIcon name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </Row>
            </Pressable>
          ))}
        </Stack>
      ) : null}

      {canSearch && suggestions.length > 0 ? (
        <Stack gap="none">
          {suggestions.map((s) => (
            <Pressable key={`${s.kind}-${s.text}`} onPress={() => applyQuery(s.text)}>
              <Row gap="sm" align="center" style={styles.suggestRow}>
                <AppIcon name="search" size={14} color={colors.textMuted} />
                <AppText variant="body" color="textSecondary" style={styles.flex}>
                  {s.text}
                </AppText>
              </Row>
            </Pressable>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );

  /** X-style trending list (plain rows); a tap runs the existing search. */
  const renderTrendingRows = (rows: TrendingRow[]) =>
    rows.map((row) => <TrendingTopicRow key={row.key} row={row} onPress={applyQuery} />);

  const trendingRows = useMemo(() => toTrendingRows(trendingItems), [trendingItems]);

  const trendingBlock = !trendingLoaded ? (
    // First load: plain X-style rows (same padding/lines as TrendingTopicRow).
    <SkeletonRegion>
      <TrendingListSkeleton count={8} />
    </SkeletonRegion>
  ) : trendingRows.length === 0 ? (
    <AppText
      variant="caption"
      color="textMuted"
      align="center"
      style={[styles.hintBox, { paddingHorizontal: gutter }]}
    >
      لا توجد موضوعات رائجة حالياً
    </AppText>
  ) : (
    <View accessibilityRole="list">{renderTrendingRows(trendingRows)}</View>
  );

  const renderExploreFeed = () => {
    // Social discovery only: trending, suggested accounts, feed suppliers, then content.
    // Listings and market categories from the API are never rendered here.
    const visibleSections = orderExploreSections(exploreSections);
    // First load: skeleton sections in the real order (trending, then accounts).
    // Recent searches are local data, so they render for real in between.
    const exploreSkeleton = exploreLoading && visibleSections.length === 0;

    // "المواضيع المتداولة" leads the Search page (full hashtags as written);
    // recent searches and the other discovery sections follow unchanged.
    const trendingSections = visibleSections.filter((sec) => sec.type === 'trending_topics');
    const otherSections = visibleSections.filter((sec) => sec.type !== 'trending_topics');
    const renderSection = (sec: ExploreFeedSection) => {
      if (sec.type === 'trending_topics') {
        const rows = toTrendingRows(sec.items as ExploreTrendingItem[]).slice(
          0,
          EXPLORE_TRENDING_PREVIEW,
        );
        if (!rows.length) return null;
        return (
          <Stack key={sec.type} gap="none">
            <AppText variant="heading3" style={{ paddingHorizontal: gutter }}>
              {TRENDING_SECTION_TITLE}
            </AppText>
            <View accessibilityRole="list">{renderTrendingRows(rows)}</View>
          </Stack>
        );
      }
      if (sec.type === 'accounts') {
        const items = sec.items as ExploreAccountItem[];
        if (!items.length) return null;
        return (
          <Stack key={sec.type} gap="sm" style={{ paddingHorizontal: gutter }}>
            <AppText variant="heading3">{sec.title}</AppText>
            {items.map((user) => (
              <UserIdentityRow
                key={user.id}
                avatarUri={user.avatar}
                displayName={user.arabicName || user.displayName || user.username}
                username={user.username}
                verified={user.verified}
                verifiedTier={user.verifiedTier}
                avatarSize={USER_IDENTITY.listAvatarSize}
                avatarRadius={USER_IDENTITY.listAvatarRadius}
                avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
                nameLines={2}
                onPress={() =>
                  router.push({ pathname: '/users/[id]', params: { id: user.id } } as never)
                }
                style={styles.userRow}
              />
            ))}
          </Stack>
        );
      }
      if (sec.type === 'feed_suppliers') {
        const items = sec.items as ExploreSupplierItem[];
        if (!items.length) return null;
        return (
          <Stack key={sec.type} gap="sm" style={{ paddingHorizontal: gutter }}>
            <AppText variant="heading3">{sec.title}</AppText>
            {items.map((s) => (
              <Pressable
                key={s.id}
                style={styles.resultRow}
                onPress={() =>
                  router.push({ pathname: '/feed-suppliers/[id]', params: { id: s.id } } as never)
                }
              >
                <Row gap="md" align="center">
                  {s.logo ? (
                    <Image source={uriSource(s.logo)} style={styles.resultThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultThumb, styles.resultThumbPlaceholder]}>
                      <AppIcon name="store" size={18} color={colors.textMuted} />
                    </View>
                  )}
                  <Stack gap="xs" style={styles.resultBody}>
                    <VerifiedInlineName name={s.nameAr} verified={s.verified}>
                      <AppText variant="body" numberOfLines={1} style={styles.nameShrink}>
                        {s.nameAr}
                      </AppText>
                    </VerifiedInlineName>
                    {s.cityAr ? (
                      <AppText variant="caption" color="textMuted">
                        {s.cityAr}
                      </AppText>
                    ) : null}
                  </Stack>
                </Row>
              </Pressable>
            ))}
          </Stack>
        );
      }
      if (sec.type === 'news') {
        const items = sec.items as ExploreNewsItem[];
        if (!items.length) return null;
        return (
          <Stack key={sec.type} gap="sm" style={{ paddingHorizontal: gutter }}>
            <AppText variant="heading3">{sec.title}</AppText>
            {items.map((n) => (
              <Pressable
                key={n.id}
                style={styles.resultRow}
                onPress={() => router.push('/news' as never)}
              >
                <Row gap="md" align="center">
                  {n.imageUrl ? (
                    <Image
                      source={uriSource(cloudinaryFitUrl(n.imageUrl, 'row'))}
                      style={styles.resultThumb}
                      contentFit="cover"
                    />
                  ) : null}
                  <AppText variant="body" numberOfLines={2} style={styles.flex}>
                    {n.titleAr}
                  </AppText>
                </Row>
              </Pressable>
            ))}
          </Stack>
        );
      }
      return null;
    };

    return (
      <Stack gap="lg">
        {exploreSkeleton ? (
          <SkeletonRegion>
            <Stack gap="none">
              <SectionTitleSkeleton style={{ paddingHorizontal: gutter }} />
              <TrendingListSkeleton count={EXPLORE_TRENDING_PREVIEW} />
            </Stack>
          </SkeletonRegion>
        ) : null}
        {trendingSections.map(renderSection)}

        {recentSearches.length > 0 ? (
          <Stack gap="sm" style={{ paddingHorizontal: gutter }}>
            <Row justify="between" align="center">
              <AppText variant="heading3">البحث الأخير</AppText>
              <Pressable onPress={() => saveRecent([])} accessibilityRole="button" accessibilityLabel="مسح الكل">
                <AppText variant="caption" color="primary">مسح الكل</AppText>
              </Pressable>
            </Row>
            {recentSearches.map((term) => (
              <Pressable key={term} onPress={() => applyQuery(term)}>
                <Row gap="md" align="center" style={styles.recentRow}>
                  <AppIcon name="time-outline" size={16} color={colors.textMuted} />
                  <AppText variant="body" color="textSecondary" style={styles.flex}>
                    {term}
                  </AppText>
                  <Pressable
                    onPress={() => saveRecent(recentSearches.filter((r) => r !== term))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="حذف"
                  >
                    <AppIcon name="close" size={14} color={colors.textMuted} />
                  </Pressable>
                </Row>
              </Pressable>
            ))}
          </Stack>
        ) : null}

        {exploreSkeleton ? (
          <SkeletonRegion>
            <Stack gap="sm" style={{ paddingHorizontal: gutter }}>
              <SectionTitleSkeleton width="30%" />
              {[0, 1, 2].map((i) => (
                <UserIdentityRowSkeleton key={i} style={styles.userRow} />
              ))}
            </Stack>
          </SkeletonRegion>
        ) : null}
        {otherSections.map(renderSection)}
      </Stack>
    );
  };

  const newsIdle = (
    <Stack gap="sm" style={{ paddingHorizontal: gutter }}>
      {!newsLoaded ? (
        <SkeletonRegion>
          {Array.from({ length: 7 }, (_, i) => (
            <ThumbRowSkeleton key={i} />
          ))}
        </SkeletonRegion>
      ) : stories.length === 0 ? (
        <AppText variant="caption" color="textMuted" align="center">
          لا توجد أخبار حالياً
        </AppText>
      ) : (
        stories.slice(0, 8).map((story, index) => (
          <Pressable key={story.id} style={styles.resultRow} onPress={() => setViewerIndex(index)}>
            <Row gap="md" align="center">
              <Image source={uriSource(cloudinaryFitUrl(story.imageUrl, 'row'))} style={styles.resultThumb} contentFit="cover" />
              <AppText variant="body" numberOfLines={2} style={styles.flex}>
                {story.titleAr}
              </AppText>
            </Row>
          </Pressable>
        ))
      )}
    </Stack>
  );

  const servicesIdle = (
    <Stack gap="md" style={{ paddingHorizontal: gutter }}>
      {!servicesLoaded ? (
        <SkeletonRegion style={styles.skeletonStack}>
          {[0, 1, 2, 3].map((i) => (
            <ServiceCardSkeleton key={i} />
          ))}
        </SkeletonRegion>
      ) : services.length === 0 ? (
        <AppText variant="caption" color="textMuted" align="center">
          لا توجد خدمات حالياً
        </AppText>
      ) : (
        services.map((service) => (
          <MinistryServiceCard
            key={service.id}
            service={service}
            onPress={() =>
              router.push({ pathname: '/ministry/services/[id]', params: { id: service.id } } as never)
            }
          />
        ))
      )}
      {/* Ministry services left the sidebar: Search is its entry point to the full list. */}
      {servicesLoaded ? (
        <Pressable
          onPress={() => router.push(MINISTRY_SERVICES_HREF as never)}
          accessibilityRole="link"
          accessibilityLabel="كل خدمات الوزارة"
        >
          <AppText variant="caption" color="primary" align="center">
            كل خدمات الوزارة
          </AppText>
        </Pressable>
      ) : null}
    </Stack>
  );

  /** Skeleton rows for a results page, matching `resultFrame` + `renderResult`. */
  const renderResultsSkeleton = () => {
    const inset = [styles.insetResult, { paddingHorizontal: gutter }];
    switch (filter) {
      case 'listings':
        return [0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.listingResult}>
            <ListingCardSkeleton />
          </View>
        ));
      case 'posts':
        return [0, 1, 2, 3].map((i) => <PostCardSkeleton key={i} withMedia={i === 1} />);
      case 'users':
        return [0, 1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={inset}>
            <UserIdentityRowSkeleton style={styles.userRow} />
          </View>
        ));
      case 'news':
        return [0, 1, 2].map((i) => (
          <View key={i} style={inset}>
            <NewsCardSkeleton />
          </View>
        ));
      case 'services':
        return [0, 1, 2, 3].map((i) => (
          <View key={i} style={inset}>
            <ServiceCardSkeleton />
          </View>
        ));
      default:
        // "all": latest mixed results — accounts first, then listings and posts.
        return (
          <>
            {[0, 1].map((i) => (
              <View key={`u${i}`} style={inset}>
                <UserIdentityRowSkeleton style={styles.userRow} />
              </View>
            ))}
            {[0, 1].map((i) => (
              <View key={`l${i}`} style={styles.listingResult}>
                <ListingCardSkeleton />
              </View>
            ))}
            <PostCardSkeleton />
          </>
        );
    }
  };

  const idleForSection =
    section === 'explore'
      ? renderExploreFeed()
      : section === 'trending'
        ? trendingBlock
        : section === 'news'
          ? newsIdle
          : servicesIdle;

  const resultItems =
    filter === 'all' ? latestItems : visibleGroups.flatMap((group) => group.items);

  const collapseTransform = useMemo(() => ({ transform: [{ translateY }] }), [translateY]);
  const identityStyle = useMemo(() => ({ opacity: identityOpacity }), [identityOpacity]);

  const sessionBack = (
    <SarhBackButton
      onPress={onSessionBack}
      color={colors.textPrimary}
      chrome="ghost"
      accessibilityLabel="رجوع"
    />
  );

  return (
    <Screen edges={isTab ? [] : ['bottom']}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.chromeLayer,
          { height: headerH },
          collapseEnabled ? collapseTransform : null,
          ambientShadow(scheme, 'soft'),
        ]}
      >
        <View style={styles.chromeClip} pointerEvents="box-none">
          <View
            collapsable={false}
            pointerEvents="box-none"
            onLayout={(event) => onChromeLayout(event.nativeEvent.layout.height)}
          >
            <HomeAppBar
              displayName={displayName}
              avatarUri={me.avatar}
              onAvatarPress={openSidebar}
              center={searchField}
              leading={phase === 'home' ? undefined : sessionBack}
              showNotifications={phase !== 'mode'}
              identityStyle={identityStyle}
              flushBottom={phase === 'home' || phase === 'results'}
            >
              {phase === 'home' ? (
                <View style={styles.searchSlot}>{chromeTabs}</View>
              ) : phase === 'results' ? (
                <View style={styles.searchSlot}>{resultTabs}</View>
              ) : null}
            </HomeAppBar>
          </View>
        </View>
      </Animated.View>

      {/* The header slides up under the status bar: keep the status area painted. */}
      {collapseEnabled && insets.top > 0 ? (
        <View pointerEvents="none" style={[styles.statusFill, { height: insets.top }]} />
      ) : null}

      <View style={styles.bodyWrap}>
      <ScreenBody
        // Flush tab header (no strip under the underline): the content owns the top gap (FLUSH_TABS_CONTENT_GAP = md).
        contentContainerStyle={bodyContentStyle}
        nativeScrollY={scrollY}
        padBottom={hideTabBar || !isTab ? 'xxxl' : 'md'}
        gutter={false}
        bottomInset={isTab && phase === 'home' ? 'tabBar' : 'none'}
        bindChromeScroll={false}
        onScroll={onBodyScroll}
        onScrollEndDrag={onScrollIdle}
        onMomentumScrollEnd={onScrollIdle}
        scrollEventThrottle={16}
      >
        {phase === 'home' ? (
          idleForSection
        ) : phase === 'mode' ? (
          modeIdle
        ) : (
          <SwipeTabPager
            pager={resultPager}
            fit="content"
            renderPage={(_page, active) =>
              // Results belong to the selected filter only; neighbours stay empty (no eager lists).
              active ? (
              <Stack gap="md">
                {query.trim().length > 0 && query.trim().length < MIN_QUERY ? (
                  <AppText
                    variant="caption"
                    color="textMuted"
                    align="center"
                    style={{ paddingHorizontal: gutter }}
                  >
                    اكتب {MIN_QUERY} أحرف على الأقل للبحث
                  </AppText>
                ) : null}

                {canSearch && suggestions.length > 0 && totalResults === 0 && !loading ? (
                  <Stack gap="none" style={{ paddingHorizontal: gutter }}>
                    {suggestions.map((s) => (
                      <Pressable key={`${s.kind}-${s.text}`} onPress={() => applyQuery(s.text)}>
                        <Row gap="sm" align="center" style={styles.suggestRow}>
                          <AppIcon name="search" size={14} color={colors.textMuted} />
                          <AppText variant="body" color="textSecondary" style={styles.flex}>
                            {s.text}
                          </AppText>
                        </Row>
                      </Pressable>
                    ))}
                  </Stack>
                ) : null}

                {loading && totalResults === 0 ? (
                  // First results load: rows shaped like the active filter's real rows.
                  <SkeletonRegion>{renderResultsSkeleton()}</SkeletonRegion>
                ) : null}

                {error && totalResults === 0 ? (
                  <Stack gap="sm" align="center" style={[styles.hintBox, { paddingHorizontal: gutter }]}>
                    <AppText variant="body" color="danger" align="center">{error}</AppText>
                    <Pressable onPress={retrySearch} accessibilityRole="button" accessibilityLabel="إعادة المحاولة">
                      <AppText variant="body" color="primary">إعادة المحاولة</AppText>
                    </Pressable>
                  </Stack>
                ) : null}

                {error && totalResults > 0 ? (
                  <AppText
                    variant="caption"
                    color="danger"
                    align="center"
                    style={{ paddingHorizontal: gutter }}
                  >
                    {error}
                  </AppText>
                ) : null}

                {canSearch && resultItems.length > 0 ? (
                  <Stack gap="none">
                    {resultItems.map((item) => {
                      const node = renderResult(item);
                      if (!node) return null;
                      return (
                        <View key={`${item.type}-${item.id}`} style={resultFrame(item.type)}>
                          {node}
                        </View>
                      );
                    })}
                  </Stack>
                ) : null}

                {loadingMore ? (
                  <ActivityIndicator color={colors.electricBright} />
                ) : null}

                {!loading && !error && canSearch && totalResults === 0 ? (
                  <Stack gap="sm" align="center" style={[styles.noResults, { paddingHorizontal: gutter }]}>
                    <AppText variant="heading3" align="center">
                      لا توجد نتائج لـ "{debouncedQuery}"
                    </AppText>
                    <AppText variant="body" color="textMuted" align="center">
                      جرّب:
                    </AppText>
                    <AppText variant="caption" color="textMuted" align="center">
                      • كلمة أقصر
                    </AppText>
                    <AppText variant="caption" color="textMuted" align="center">
                      • كتابة مختلفة
                    </AppText>
                    <AppText variant="caption" color="textMuted" align="center">
                      • إزالة بعض الكلمات
                    </AppText>
                  </Stack>
                ) : null}
              </Stack>
              ) : null
            }
          />
        )}
      </ScreenBody>
      </View>

      {viewerIndex != null ? (
        <EditorialStoryViewer
          stories={stories}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const tokens = scheme === 'light' ? ds.light : ds.dark;
  return StyleSheet.create({
    chromeLayer: {
      position: 'absolute',
      top: 0,
      start: 0,
      end: 0,
      zIndex: 2,
    },
    chromeClip: {
      height: '100%',
      overflow: 'hidden',
    },
    bodyWrap: {
      flex: 1,
    },
    /** Same surface as the bottom tab bar (tokens.tabBar, no blur). */
    sessionShell: {
      backgroundColor: tokens.tabBar,
      borderBottomColor: tokens.glassBorder,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    statusFill: {
      position: 'absolute',
      top: 0,
      start: 0,
      end: 0,
      zIndex: 2,
      backgroundColor: tokens.tabBar,
    },
    resultsInner: {
      width: '100%',
      paddingBottom: space[8],
    },
    resultsIdentity: {
      width: '100%',
      minHeight: space[40],
    },
    iconBtn: {
      width: space[40],
      height: space[40],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    searchSlot: {
      paddingTop: 8,
    },
    stackChrome: {
      backgroundColor: colors.screenRoot,
    },
    searchBar: {
      paddingTop: 4,
      paddingBottom: 8,
      backgroundColor: 'transparent',
    },
    inputFlex: { flex: 1 },
    flex: { flex: 1 },
    sectionRow: {
      paddingTop: 8,
    },
    sectionTab: {
      alignItems: 'center',
      justifyContent: 'flex-end',
      minHeight: 48,
      // + the label wrap's overhang padding = TAB_SIDE_PAD each side of the label.
      paddingHorizontal: TAB_SIDE_PAD - HEADER_TAB_INDICATOR_OVERHANG,
    },
    /** Tabs sit edge to edge; spacing comes from each tab's own side padding. */
    tabRowContent: {
      gap: 0,
    },
    /** Label + underline: the bar spans the label and sits on the header's bottom edge. */
    sectionTabLabelWrap: {
      position: 'relative',
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: 12,
      paddingHorizontal: HEADER_TAB_INDICATOR_OVERHANG,
    },
    /** Active tab label: bolder than the (textSecondary) idle labels. */
    tabLabelActive: {
      ...resolveAppFontFace('700'),
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: HEADER_TAB_INDICATOR_THICKNESS,
      borderRadius: 999,
      backgroundColor: colors.textPrimary,
    },
    filterRowWrap: {
      backgroundColor: 'transparent',
      paddingTop: 4,
    },
    /** No strip under the tabs: the sliding underline is the header's bottom edge. */
    filterRowContent: {
      paddingBottom: 0,
    },
    resultTab: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      paddingBottom: 12,
      paddingHorizontal: TAB_SIDE_PAD,
      position: 'relative',
    },
    suggestRow: {
      paddingVertical: 12,
    },
    recentRow: {
      minHeight: 48,
    },
    nameShrink: { flexShrink: 1 },
    userRow: {
      paddingVertical: 12,
    },
    listingResult: {
      paddingBottom: space[8],
    },
    postResult: {},
    insetResult: {
      paddingBottom: space[12],
    },
    newsCard: {
      height: 168,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      justifyContent: 'flex-end',
    },
    newsImage: { ...StyleSheet.absoluteFillObject },
    newsGradient: { ...StyleSheet.absoluteFillObject },
    newsTitle: {
      padding: 12,
      zIndex: 1,
    },
    resultRow: {
      paddingVertical: 12,
    },
    resultThumb: { width: 56, height: 56, borderRadius: ds.radius.md },
    resultThumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgDeep,
    },
    resultBody: { flex: 1, justifyContent: 'center' },
    /** = servicesIdle Stack gap="md". */
    skeletonStack: { gap: space[12] },
    hintBox: { paddingVertical: 24 },
    noResults: { paddingVertical: 48 },
  });
}
