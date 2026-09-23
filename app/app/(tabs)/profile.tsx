// Powered by OnSpace.AI
// SAFAT — Profile Tab (حسابي)
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet } from 'react-native';
import { AppText, SarhButton } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { space } from '@/design-system/tokens';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useSellerListingsPager } from '@/hooks/useSellerListingsPager';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { ListingCard } from '@/components/feature/ListingCard';
import { SellerListingsPaginationFooter } from '@/components/feature/SellerListingsPaginationFooter';
import { PostItem } from '@/components/feature/PostItem';
import { ProfileScreenLayout, type ProfileDisplayUser } from '@/components/feature/ProfileScreenLayout';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { openPostDetail } from '@/lib/openPost';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { safePush } from '@/lib/safeNavigate';
import { fetchStoriesFeed, type StoryGroup } from '@/services/stories';
import { shouldReuseFreshResult } from '@/services/requestCoordination';

const PROFILE_FOCUS_TTL_MS = 60_000;

/** Layout only — an empty tab still needs vertical presence in the feed. */
const EMPTY_STATE = StyleSheet.create({
  block: { paddingVertical: space[48] },
}).block;

export default function ProfileScreen() {
  const router = useRouter();
  // Subscribe so the empty-state text re-resolves its color after a scheme switch.
  useTheme();

  const {
    me,
    posts,
    likedPosts,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    deletePost,
    refetchData,
    refetchUser,
  } = useApp();
  const { accessToken, isAuthenticated } = useAuth();

  const [hasStories, setHasStories] = useState(false);
  const [myStoryGroup, setMyStoryGroup] = useState<StoryGroup | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastListingsAt = useRef(0);
  const listingsLoadedForUser = useRef<string | null>(null);
  const {
    listings: myListings,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadFirstPage,
    loadNextPage,
  } = useSellerListingsPager({ sellerId: me.id, accessToken });

  const profileUrl = sarhProfileShareUrl(me.username);

  const loadStories = useCallback(async (force = false) => {
    try {
      const data = await fetchStoriesFeed(accessToken, { force });
      const mine = data.myStories ?? null;
      setMyStoryGroup(mine);
      const now = Date.now();
      setHasStories(
        mine != null &&
          (mine.stories?.length ?? 0) > 0 &&
          mine.stories.some((s) => new Date(s.expiresAt).getTime() > now),
      );
    } catch {
      /* silent */
    }
  }, [accessToken]);

  const loadMyListings = useCallback(async (force = false) => {
    if (!me.id) {
      listingsLoadedForUser.current = null;
      lastListingsAt.current = 0;
      try {
        await loadFirstPage();
      } catch {
        /* keep current listings */
      }
      return;
    }
    if (
      listingsLoadedForUser.current === me.id &&
      shouldReuseFreshResult(lastListingsAt.current, PROFILE_FOCUS_TTL_MS, force)
    ) {
      return;
    }
    try {
      await loadFirstPage();
      lastListingsAt.current = Date.now();
      listingsLoadedForUser.current = me.id;
    } catch {
      /* keep current listings */
    }
  }, [loadFirstPage, me.id]);

  useFocusEffect(
    useCallback(() => {
      void loadStories();
      void refetchUser();
      void loadMyListings();
    }, [loadMyListings, loadStories, refetchUser]),
  );
  const myPosts = useMemo(
    () =>
      posts
        .filter((p) => p.author.id === me.id)
        .slice()
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()),
    [posts, me.id],
  );

  const profileUser: ProfileDisplayUser = useMemo(
    () => ({
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      arabicName: me.arabicName,
      avatar: me.avatar,
      verified: me.verified,
      bio: me.bio,
      country: me.country,
      followersCount: me.followers,
      followingCount: me.following,
      postsCount: me.postsCount ?? myPosts.length,
      rating: me.rating,
      reviewCount: me.reviewCount ?? 0,
    }),
    [me, myPosts.length],
  );

  const openConnections = (t: 'followers' | 'following') => {
    safePush(
      {
        pathname: '/profile/connections',
        params: { userId: me.id, tab: t, username: me.username },
      },
      undefined,
      router,
    );
  };

  const handleShare = () => {
    Share.share({
      message: `تفقّد بروفايل ${me.arabicName || me.displayName} في تطبيق سرح 🐪\n${profileUrl}`,
      title: 'سرح — المنصة الوطنية للثروة الحيوانية',
      url: profileUrl,
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStories(true), refetchData(true), loadMyListings(true)]);
    setRefreshing(false);
  }, [loadMyListings, loadStories, refetchData]);

  const renderPosts = () => {
    if (myPosts.length === 0) {
      return (
        <Stack gap="md" align="center" style={EMPTY_STATE}>
          <AppText variant="body" color="textMuted">
            لا توجد منشورات بعد
          </AppText>
          <SarhButton
            title="أنشئ منشوراً"
            size="sm"
            leftIcon="plus"
            onPress={() => safePush('/create/post', undefined, router)}
          />
        </Stack>
      );
    }

    return myPosts.map((post) => (
      <PostItem
        key={post.id}
        variant="profile"
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
        onBookmark={() => requireAuth(isAuthenticated, 'الحفظ') && void toggleBookmark(post.id)}
        onShare={() => sharePost(post)}
        onMenu={() => showPostMenu(post, me, router, deletePost, isAuthenticated)}
      />
    ));
  };

  const renderAds = () => {
    if (myListings.length === 0) {
      return (
        <Stack gap="md" align="center" style={EMPTY_STATE}>
          <AppText variant="body" color="textMuted">
            لا توجد إعلانات بعد
          </AppText>
          <SarhButton
            title="أضف إعلاناً"
            size="sm"
            leftIcon="plus"
            onPress={() => void navigateToCreateListing()}
          />
        </Stack>
      );
    }

    return (
      <>
        {myListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            variant="list"
            listMode="market"
            onPress={() =>
              safePush({ pathname: '/listing/[id]', params: { id: listing.id } }, undefined, router)
            }
          />
        ))}
        <SellerListingsPaginationFooter
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMoreFailed={loadMoreFailed}
          onLoadMore={() => void loadNextPage()}
        />
      </>
    );
  };

  return (
    <ProfileScreenLayout
      mode="own"
      user={profileUser}
      hasStoryRing={hasStories}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEditProfile={() => safePush('/profile/edit', undefined, router)}
      onEditAvatar={() => safePush('/profile/edit', undefined, router)}
      onAvatarPress={() => {
        if (hasStories && myStoryGroup) {
          safePush(
            {
              pathname: '/stories/view',
              params: { groupIndex: '0' },
            },
            undefined,
            router,
          );
        }
      }}
      onFollowersPress={() => openConnections('followers')}
      onFollowingPress={() => openConnections('following')}
      postsContent={renderPosts()}
      adsContent={renderAds()}
      onAdsNearEnd={() => void loadNextPage()}
    />
  );
}
