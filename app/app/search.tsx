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
import { AppText, SarhBackButton, SarhChipRow, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
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
  type ExploreCategoryItem,
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

type ExploreSection = 'explore' | 'trending' | 'news' | 'services';

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
    paddingFor,
    resetCollapse,
  } = useCollapsibleSearchHeader(SHELL_IDENTITY_COLLAPSE_H);
  const [section, setSection] = useState<ExploreSection>('explore');
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
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [filter, setFilter] = useState<SearchFilter>('all');
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

  // Ensure editorial stories exist for news result viewer (without mounting storm)
  useEffect(() => {
    if (newsLoaded) return;
    if (filter !== 'news' && !groups.some((g) => g.type === 'news' && g.items.length > 0)) {
      return;
    }
    let cancelled = false;
    void fetchEditorialStories()
      .then((data) => {
        if (cancelled) return;
        setStories(data);
        setNewsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setNewsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
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

    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    unifiedSearch({
      q: debouncedQuery,
      type: filter,
      page: nextPage,
      limit: filter === 'all' ? 8 : 20,
      signal: ac.signal,
    })
      .then((res) => {
        if (seq !== searchSeq.current) return;
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
        setError(err instanceof Error ? err.message : 'تعذر إتمام البحث');
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
    setFilter('all');
    setPage(1);
    setLoading(false);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    resetCollapse();
    Keyboard.dismiss();
  }, [resetCollapse]);

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
  const bodyPaddingTop = useMemo(
    () => (collapseEnabled ? paddingFor(headerH) : headerH),
    [collapseEnabled, headerH, paddingFor],
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

  const onBodyScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollingRef.current = true;
          onChromeScroll(event);
          if (phaseRef.current !== 'results') return;
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 180) {
            loadMoreRef.current();
          }
        },
      }),
    [onChromeScroll, scrollY],
  );

  const retrySearch = useCallback(() => {
    setPage(1);
    runSearch(1, false);
  }, [runSearch]);

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
        };
        return (
          <UserIdentityRow
            avatarUri={user.avatar ?? item.imageUrl}
            displayName={user.arabicName || user.displayName || user.username || item.title}
            username={user.username}
            verified={user.verified}
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
    <Row style={styles.sectionRow}>
      {EXPLORE_SECTIONS.map((item) => {
        const active = section === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => selectSection(item.id)}
            style={styles.sectionTab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <AppText variant="body" color={active ? 'textPrimary' : 'textMuted'} numberOfLines={1}>
              {item.label}
            </AppText>
            {active ? <View style={styles.tabIndicator} /> : null}
          </Pressable>
        );
      })}
    </Row>
  );

  const resultTabs = (
    <SarhChipRow contentPaddingHorizontal={gutter} style={styles.filterRowWrap}>
      {RESULT_SECTIONS.map((item) => {
        const active = filter === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => setFilter(item.id)}
            style={styles.resultTab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <AppText variant="body" color={active ? 'textPrimary' : 'textMuted'} numberOfLines={1}>
              {item.label}
            </AppText>
            {active ? <View style={styles.resultTabIndicator} /> : null}
          </Pressable>
        );
      })}
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

  const trendingBlock = (
    <Stack gap="md">
      <AppText variant="heading3">الأكثر تداولاً</AppText>
      {!trendingLoaded ? (
        <ActivityIndicator color={colors.electricBright} />
      ) : trendingItems.length === 0 ? (
        <AppText variant="caption" color="textMuted">لا توجد موضوعات رائجة حالياً</AppText>
      ) : (
        <Row gap="sm" wrap>
          {trendingItems.map((item) => (
            <Pressable key={item.tag} style={styles.trendingChip} onPress={() => applyQuery(item.tag)}>
              <AppText variant="caption" color="textSecondary">
                {item.tag}
                {typeof item.count === 'number' ? ` · ${item.count}` : ''}
              </AppText>
            </Pressable>
          ))}
        </Row>
      )}
    </Stack>
  );

  const renderExploreFeed = () => {
    if (exploreLoading && exploreSections.length === 0) {
      return (
        <Stack gap="md" align="center" style={[styles.hintBox, { paddingHorizontal: gutter }]}>
          <ActivityIndicator color={colors.electricBright} />
        </Stack>
      );
    }

    return (
      <Stack gap="lg" style={{ paddingHorizontal: gutter }}>
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

        {exploreSections.map((sec) => {
          if (sec.type === 'trending_topics') {
            const items = sec.items as ExploreTrendingItem[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="sm">
                <AppText variant="heading3">{sec.title}</AppText>
                <Row gap="sm" wrap>
                  {items.map((item) => (
                    <Pressable
                      key={item.tag}
                      style={styles.trendingChip}
                      onPress={() => applyQuery(item.tag)}
                    >
                      <AppText variant="caption" color="textSecondary">
                        {item.tag}
                      </AppText>
                    </Pressable>
                  ))}
                </Row>
              </Stack>
            );
          }
          if (sec.type === 'accounts') {
            const items = sec.items as ExploreAccountItem[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="sm">
                <AppText variant="heading3">{sec.title}</AppText>
                {items.map((user) => (
                  <UserIdentityRow
                    key={user.id}
                    avatarUri={user.avatar}
                    displayName={user.arabicName || user.displayName || user.username}
                    username={user.username}
                    verified={user.verified}
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
          if (sec.type === 'listings') {
            const items = sec.items as Record<string, unknown>[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="md">
                <AppText variant="heading3">{sec.title}</AppText>
                {items.map((raw) => {
                  const listing = mapListingFromSearch(raw);
                  if (!listing) return null;
                  return (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      variant="list"
                      listMode="market"
                      onPress={() =>
                        router.push({ pathname: '/listing/[id]', params: { id: listing.id } })
                      }
                    />
                  );
                })}
              </Stack>
            );
          }
          if (sec.type === 'news') {
            const items = sec.items as ExploreNewsItem[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="sm">
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
          if (sec.type === 'feed_categories') {
            const items = sec.items as ExploreCategoryItem[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="sm">
                <AppText variant="heading3">{sec.title}</AppText>
                {items.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={styles.resultRow}
                    onPress={() =>
                      router.push({
                        pathname: '/market/categories/[id]',
                        params: { id: cat.id },
                      } as never)
                    }
                  >
                    <AppText variant="body">
                      {cat.emoji ? `${cat.emoji} ` : ''}
                      {cat.nameAr}
                    </AppText>
                  </Pressable>
                ))}
              </Stack>
            );
          }
          if (sec.type === 'feed_suppliers') {
            const items = sec.items as ExploreSupplierItem[];
            if (!items.length) return null;
            return (
              <Stack key={sec.type} gap="sm">
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
                        <AppText variant="body">{s.nameAr}</AppText>
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
          return null;
        })}
      </Stack>
    );
  };

  const newsIdle = (
    <Stack gap="sm" style={{ paddingHorizontal: gutter }}>
      {!newsLoaded ? (
        <ActivityIndicator color={colors.electricBright} />
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
        <ActivityIndicator color={colors.electricBright} />
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
    </Stack>
  );

  const idleForSection =
    section === 'explore'
      ? renderExploreFeed()
      : section === 'trending'
        ? (
          <Stack gap="lg" style={{ paddingHorizontal: gutter }}>
            {trendingBlock}
          </Stack>
        )
        : section === 'news'
          ? newsIdle
          : servicesIdle;

  const resultItems =
    filter === 'all' ? latestItems : visibleGroups.flatMap((group) => group.items);

  const collapseStyle = useMemo(() => ({ transform: [{ translateY }] }), [translateY]);
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
          { height: bodyPaddingTop },
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
              collapseStyle={collapseStyle}
              identityStyle={identityStyle}
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

      <Animated.View style={[styles.bodyWrap, { paddingTop: bodyPaddingTop }]}>
      <ScreenBody
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
              <Stack gap="md" align="center" style={[styles.loadingBox, { paddingHorizontal: gutter }]}>
                <ActivityIndicator color={colors.glow} />
                <AppText variant="caption" color="textMuted">جاري البحث...</AppText>
              </Stack>
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
        )}
      </ScreenBody>
      </Animated.View>

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
    sessionShell: {
      backgroundColor: tokens.glass,
      borderBottomColor: tokens.glassBorder,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    statusFill: {
      position: 'absolute',
      top: 0,
      start: 0,
      end: 0,
      zIndex: 2,
      backgroundColor: tokens.glass,
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
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      paddingBottom: 6,
      position: 'relative',
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      width: 18,
      height: 2,
      borderRadius: 999,
      backgroundColor: colors.textPrimary,
    },
    filterRowWrap: {
      backgroundColor: 'transparent',
      paddingTop: 4,
    },
    resultTab: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      paddingBottom: 8,
      paddingHorizontal: 4,
      position: 'relative',
    },
    resultTabIndicator: {
      position: 'absolute',
      bottom: 0,
      width: 22,
      height: 2,
      borderRadius: 999,
      backgroundColor: colors.textPrimary,
    },
    suggestRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    recentRow: {
      minHeight: 48,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    trendingChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: ds.radius.pill,
      backgroundColor: tokens.primaryMuted,
    },
    userRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    resultThumb: { width: 56, height: 56, borderRadius: ds.radius.md },
    resultThumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgDeep,
    },
    resultBody: { flex: 1, justifyContent: 'center' },
    loadingBox: { paddingVertical: 32 },
    hintBox: { paddingVertical: 24 },
    noResults: { paddingVertical: 48 },
  });
}
