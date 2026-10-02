// Powered by OnSpace.AI
// SAFAT — Posts Tab (المنشورات) — X-style For you / Following

import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { SwipeTabPager } from '@/components/ui/SwipeTabPager';
import { AppChromeLayer } from '@/components/navigation/AppChromeLayer';
import { HomeAppBar, shellIdentityStackH } from '@/components/ui/HomeAppBar';
import { ds } from '@/constants/designSystem';
import { type ThemeColors } from '@/constants/theme';
import { space } from '@/design-system/tokens';
import { AppText, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useSwipeTabPager } from '@/hooks/useSwipeTabPager';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { PostItem } from '@/components/feature/PostItem';
import { PostCardSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { CreatePostFab } from '@/components/feature/CreatePostFab';
import { requireAuth } from '@/lib/postInteractions';
import { openPostDetail } from '@/lib/openPost';
import { usePostFeedActions } from '@/lib/usePostFeedActions';
import { safePush } from '@/lib/safeNavigate';
import type { Post } from '@/services/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FeedTab = 'for_you' | 'following';

const FEED_TABS: readonly FeedTab[] = ['for_you', 'following'];
const FOLLOWING_AUTH_ACTION = 'عرض منشورات المتابَعين';

export default function PostsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(({ colors: c }) => createPostsStyles(c));
  const { postId, openComments } = useLocalSearchParams<{
    postId?: string;
    openComments?: string;
  }>();
  const { isAuthenticated } = useAuth();
  const {
    me,
    posts,
    fetchPosts,
  } = useApp();
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
  const { width: windowWidth } = useWindowDimensions();
  /** Same swipe pager as /bookmarks: one index drives the tab, indicator and page. */
  const feedPager = useSwipeTabPager({
    count: FEED_TABS.length,
    width: windowWidth,
    // A signed-out swipe to "following" gets the same sign-in prompt as a tap and snaps back.
    canSelect: (i) => FEED_TABS[i] !== 'following' || requireAuth(isAuthenticated, FOLLOWING_AUTH_ACTION),
  });
  const feedTab: FeedTab = FEED_TABS[feedPager.index] ?? 'for_you';
  const [headerH, setHeaderH] = useState(() => shellIdentityStackH(insets.top) + space[32]);
  // Cold start with no cached feed paints skeleton rows from the first frame.
  const [loadingFeed, setLoadingFeed] = useState(() => posts.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const loadedTabs = useRef<Set<FeedTab>>(new Set());
  const postsLenRef = useRef(posts.length);
  const loadingFeedRef = useRef(loadingFeed);
  const skipFirstFocusRef = useRef(true);
  postsLenRef.current = posts.length;
  loadingFeedRef.current = loadingFeed;

  const loadFeed = useCallback(
    async (tab: FeedTab, opts?: { refresh?: boolean; force?: boolean }) => {
      if (opts?.refresh) setRefreshing(true);
      else if (!loadedTabs.current.has(tab) && postsLenRef.current === 0) setLoadingFeed(true);
      try {
        if (tab === 'following' && !isAuthenticated) {
          await fetchPosts('for_you', { force: Boolean(opts?.refresh || opts?.force) });
          loadedTabs.current.add('for_you');
          return;
        }
        await fetchPosts(tab, { force: Boolean(opts?.refresh || opts?.force) });
        loadedTabs.current.add(tab);
      } finally {
        setLoadingFeed(false);
        setRefreshing(false);
      }
    },
    [fetchPosts, isAuthenticated],
  );

  useEffect(() => {
    // Use AppContext cache for "for you" on first paint; only fetch if empty or tab switch
    if (feedTab === 'for_you' && posts.length > 0 && loadedTabs.current.has('for_you')) {
      return;
    }
    if (feedTab === 'for_you' && posts.length > 0 && !loadedTabs.current.has('for_you')) {
      loadedTabs.current.add('for_you');
      return;
    }
    void loadFeed(feedTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when tab changes
  }, [feedTab]);

  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      if (postsLenRef.current > 0 || loadingFeedRef.current) return;
      void loadFeed(feedTab, { force: true });
    }, [feedTab, loadFeed]),
  );

  useEffect(() => {
    if (!postId) return;
    openPostDetail(router, postId, { focusComment: openComments === '1' });
  }, [postId, openComments, router]);

  const switchTab = (tab: FeedTab) => {
    if (tab === 'following' && !isAuthenticated) {
      requireAuth(false, FOLLOWING_AUTH_ACTION);
      return;
    }
    feedPager.goTo(FEED_TABS.indexOf(tab));
  };

  const openSidebar = useCallback(() => {
    if (!isAuthenticated) {
      safePush('/auth/phone', undefined, router);
      return;
    }
    safePush('/sidebar', undefined, router);
  }, [isAuthenticated, router]);

  const displayName = isAuthenticated
    ? me.arabicName || me.displayName || me.username || 'حسابي'
    : 'ضيف';

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => {
      const post = enrich(item);
      return <PostItem post={post} {...bind(post)} />;
    },
    [enrich, bind],
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

  const ListEmpty = (
    <Stack gap="md" align="center" style={styles.empty}>
      <AppText variant="heading2" align="center">
        {feedTab === 'following' ? '👥' : '📝'}
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        {feedTab === 'following'
          ? 'لا منشورات من حسابات تتابعها بعد'
          : 'لا توجد منشورات بعد'}
      </AppText>
      {feedTab === 'for_you' ? (
        <SarhButton title="أنشئ أول منشور" onPress={() => router.push('/create/post')} />
      ) : null}
    </Stack>
  );

  const FeedSkeleton = (
    <SkeletonRegion>
      {[false, true, false, false].map((withMedia, i) => (
        <PostCardSkeleton key={i} withMedia={withMedia} />
      ))}
    </SkeletonRegion>
  );

  return (
    <Screen edges={[]}>
      <AppChromeLayer onHeight={setHeaderH}>
        <HomeAppBar
          displayName={displayName}
          avatarUri={me.avatar}
          onAvatarPress={openSidebar}
        >
          <Row gap="sm">
            {FEED_TABS.map((tab) => {
              const active = feedTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => switchTab(tab)}
                  style={styles.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <AppText variant="label" color={active ? 'textPrimary' : 'textMuted'}>
                    {tab === 'for_you' ? 'لك' : 'متابعة'}
                  </AppText>
                  {active ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              );
            })}
          </Row>
        </HomeAppBar>
      </AppChromeLayer>

      <ScreenBody scroll={false} gutter={false} bottomInset="tabBar">
        <SwipeTabPager
          pager={feedPager}
          renderPage={(_page, active) =>
            // Both tabs share the one AppContext feed: only the selected page mounts the list.
            active ? (
              // One list for every phase: first load shows PostItem-shaped
              // skeleton rows in place (no centred spinner); refresh keeps posts.
              <AppFlatList
                data={posts}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={[styles.scroll, { paddingTop: headerH }]}
                ListEmptyComponent={loadingFeed && posts.length === 0 ? FeedSkeleton : ListEmpty}
                ListFooterComponent={<View style={styles.listFooter} />}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void loadFeed(feedTab, { refresh: true })}
                    tintColor={colors.electricBright}
                  />
                }
                initialNumToRender={6}
                maxToRenderPerBatch={4}
                windowSize={7}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
              />
            ) : null
          }
        />
      </ScreenBody>

      <CreatePostFab mode="fixed" />
    </Screen>
  );
}

function createPostsStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: space[32],
      position: 'relative',
      paddingBottom: space[8],
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      width: space[20],
      height: 2,
      borderRadius: 999,
      backgroundColor: themeColors.electric,
    },
    scroll: { paddingBottom: space[12], flexGrow: 1 },
    listFooter: { height: ds.tabBar.fabLift + space[32] },
    empty: {
      justifyContent: 'center',
      paddingVertical: space[32],
    },
  });
}
