// SAFAT — Public User Profile
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { AppText } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { space } from '@/design-system/tokens';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchUserProfile,
  getCachedUserProfile,
  rateUser,
  setFollowUser,
  setBlockUser,
  type PublicUserProfile,
} from '@/services/users';
import { fetchUserPosts } from '@/services/posts';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { useSellerListingsPager } from '@/hooks/useSellerListingsPager';
import type { Post } from '@/services/types';
import { promptReport } from '@/services/reports';
import { ListingCard } from '@/components/feature/ListingCard';
import { ListingCardSkeleton, PostCardSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { SellerListingsPaginationFooter } from '@/components/feature/SellerListingsPaginationFooter';
import { PostItem } from '@/components/feature/PostItem';
import { ProfileReplyRow } from '@/components/feature/ProfileReplyRow';
import { ProfileRepostAttribution } from '@/components/feature/ProfileRepostAttribution';
import { ProfileScreenLayout, type ProfileDisplayUser } from '@/components/feature/ProfileScreenLayout';
import { useProfileActivity } from '@/hooks/useProfileActivity';
import type { ProfileTabKey } from '@/lib/profileTabs';
import { RatingModal } from '@/components/feature/RatingModal';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { openPostDetail } from '@/lib/openPost';
import { presentActionSheet, confirmDestructive, alertMessage } from '@/lib/actionSheet';
import { fetchMutedUsers, setMuteUser } from '@/services/userSettings';
import { MEMBER_OF_MENU_ITEM, openMemberOfCollections } from '@/lib/profileCollectionsMenu';
import { showToast } from '@/lib/toast';
import { resolveProfileBack } from '@/lib/profileHeader';
import { safeReplace } from '@/lib/safeNavigate';
import { SHARE_ICON } from '@/lib/interactionActions';
import { parseProfileLinks } from '@/lib/profileLinks';
import { showAlert } from '@/lib/confirmDialog';

/** Layout only — an empty tab still needs vertical presence in the feed. */
/** Stand-in identity while the profile request is in flight (rendered as skeleton). */
const LOADING_PROFILE_USER: ProfileDisplayUser = {
  id: '',
  username: '',
  displayName: '',
  arabicName: '',
  verified: false,
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
};

const styles = StyleSheet.create({
  /** = ProfileScreenLayout postsFeed gap between tab rows. */
  skeletonList: { gap: space[4] },
  emptyState: { paddingVertical: space[48] },
});

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    me,
    likedPosts,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    deletePost,
  } = useApp();
  const { accessToken, isAuthenticated, isLoading: authLoading } = useAuth();

  const isOwnProfile = !id || id === me.id;
  const targetId = id || me.id;
  const [profile, setProfile] = useState<PublicUserProfile | null>(() =>
    targetId ? getCachedUserProfile(targetId) : null,
  );
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [postsLoadFailed, setPostsLoadFailed] = useState(false);
  const [listingsLoadFailed, setListingsLoadFailed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  /** Target whose posts + first listings page have settled (first-load skeletons until then). */
  const [extrasLoadedFor, setExtrasLoadedFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingVisible, setRatingVisible] = useState(false);
  const {
    listings: userListings,
    hasMore,
    loading: listingsLoading,
    loadingMore,
    loadMoreFailed,
    loadFirstPage,
    loadNextPage,
  } = useSellerListingsPager({ sellerId: isOwnProfile ? null : targetId, accessToken });
  const activity = useProfileActivity(isOwnProfile ? null : targetId);
  const profileRepostName = profile?.arabicName || profile?.displayName || profile?.username || '';
  const listingsLoadGen = useRef(0);
  const loadedExtrasForRef = useRef<string | null>(null);
  const profileRef = useRef<PublicUserProfile | null>(profile);
  profileRef.current = profile;

  useEffect(() => {
    loadedExtrasForRef.current = null;
    const cached = targetId ? getCachedUserProfile(targetId) : null;
    if (cached) {
      setProfile(cached);
    } else {
      setProfile((prev) => (prev?.id === targetId ? prev : null));
    }
    setUserPosts([]);
  }, [targetId]);

  useEffect(() => {
    return () => {
      listingsLoadGen.current += 1;
    };
  }, []);

  const fetchAuthoritativeProfile = useCallback(async (force = false) => {
    if (!isAuthenticated || !accessToken) return null;
    const requestedId = id || me.id;
    const data = await fetchUserProfile(requestedId, { force });
    if (data && (id || me.id) === requestedId) setProfile(data);
    return data;
  }, [accessToken, id, isAuthenticated, me.id]);

  const loadProfile = useCallback(async (force = false) => {
    const requestedId = id || me.id;
    if (
      !force &&
      profileRef.current?.id === requestedId &&
      loadedExtrasForRef.current === requestedId
    ) {
      await fetchAuthoritativeProfile(false);
      return;
    }
    const gen = ++listingsLoadGen.current;
    const data = await fetchAuthoritativeProfile(force);
    if (!data || gen !== listingsLoadGen.current) {
      return;
    }
    const [postsResult, listingsResult] = await Promise.allSettled([
      fetchUserPosts(requestedId),
      loadFirstPage(),
    ]);
    if (gen !== listingsLoadGen.current) return;
    if (postsResult.status === 'fulfilled') {
      setUserPosts(postsResult.value);
      setPostsLoadFailed(false);
    } else {
      setPostsLoadFailed(true);
    }
    if (listingsResult.status === 'fulfilled') {
      setListingsLoadFailed(false);
    } else {
      setListingsLoadFailed(true);
    }
    loadedExtrasForRef.current = requestedId;
    setExtrasLoadedFor(requestedId);
  }, [fetchAuthoritativeProfile, id, loadFirstPage, me.id]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading || !isAuthenticated || !accessToken) return;
      if (isOwnProfile) {
        router.replace('/(tabs)/profile');
        return;
      }
      void loadProfile();
    }, [accessToken, authLoading, isAuthenticated, isOwnProfile, loadProfile, router]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(true), activity.reloadVisited()]);
    setRefreshing(false);
  }, [activity.reloadVisited, loadProfile]);

  const onTabChange = useCallback(
    (tab: ProfileTabKey) => {
      if (tab === 'replies' || tab === 'reposts') {
        void activity.load(tab);
      }
    },
    [activity.load],
  );

  const handleFollow = async () => {
    if (!profile || !accessToken || followLoading) {
      showAlert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    setFollowLoading(true);
    try {
      const result = await setFollowUser(profile.id, !profile.isFollowing);
      if (!result) throw new Error('follow_failed');
      await fetchAuthoritativeProfile(true);
    } catch {
      await fetchAuthoritativeProfile(true);
      showAlert('خطأ', 'تعذّرت المتابعة، حاول مجدداً');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleChat = () => {
    if (!profile) return;
    if (profile.allowPrivateMessages === false) {
      showAlert('الرسائل الخاصة', 'هذا المستخدم لا يقبل الرسائل الخاصة');
      return;
    }
    if (!accessToken) {
      showAlert('تسجيل الدخول', 'يجب تسجيل الدخول لبدء محادثة');
      return;
    }
    router.push({
      pathname: '/chat',
      params: {
        receiverId: profile.id,
        receiverName: profile.arabicName,
        receiverAvatar: profile.avatar ?? '',
        accountType: profile.accountType ?? 'USER',
        threadType: 'DIRECT',
      },
    } as never);
  };

  const extrasPending = extrasLoadedFor !== targetId;

  const postsSkeleton = (
    <SkeletonRegion style={styles.skeletonList}>
      {[false, true, false].map((withMedia, i) => (
        <PostCardSkeleton key={i} withMedia={withMedia} />
      ))}
    </SkeletonRegion>
  );

  const listingsSkeleton = (
    <SkeletonRegion style={styles.skeletonList}>
      {[0, 1, 2, 3].map((i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  );

  const renderLoadError = (message: string) => (
    <Stack gap="none" align="center" style={styles.emptyState}>
      <AppText variant="body" color="textMuted">
        {message}
      </AppText>
    </Stack>
  );

  const renderPosts = () => {
    if (userPosts.length === 0 && extrasPending) return postsSkeleton;
    if (postsLoadFailed && userPosts.length === 0) {
      return renderLoadError('تعذّر تحميل المنشورات، اسحب للتحديث');
    }
    if (userPosts.length === 0) {
      return (
        <Stack gap="none" align="center" style={styles.emptyState}>
          <AppText variant="body" color="textMuted">
            لا توجد منشورات بعد
          </AppText>
        </Stack>
      );
    }

    return userPosts.map((post) => renderPost(post));
  };

  const renderPost = (post: Post, extra?: { attribution?: boolean }) => (
    <View key={post.id}>
      {extra?.attribution ? <ProfileRepostAttribution name={profileRepostName} /> : null}
      <PostItem
        variant="profile"
        post={{
          ...post,
          liked: likedPosts.has(post.id),
          bookmarked: bookmarkedPosts.has(post.id),
          reposted: extra?.attribution ? true : repostedPosts.has(post.id),
        }}
        onPress={() => openPostDetail(router, post.id)}
        onLike={() => requireAuth(isAuthenticated, 'الإعجاب') && void toggleLike(post.id)}
        onRepost={() => requireAuth(isAuthenticated, 'إعادة النشر') && void toggleRepost(post.id)}
        onComment={() => openPostDetail(router, post.id, { focusComment: isAuthenticated })}
        onBookmark={() => requireAuth(isAuthenticated, 'الحفظ') && toggleBookmark(post.id)}
        onShare={() => sharePost(post)}
        onMenu={() => showPostMenu(post, me, router, deletePost, isAuthenticated)}
      />
    </View>
  );

  const renderActivityEmpty = (message: string, loading?: boolean, rows: 'reply' | 'post' = 'post') =>
    loading ? (
      <SkeletonRegion style={styles.skeletonList}>
        {[0, 1, 2].map((i) => (
          <PostCardSkeleton key={i} bodyLines={rows === 'reply' ? 1 : 2} showActions={rows !== 'reply'} />
        ))}
      </SkeletonRegion>
    ) : (
      <Stack gap="none" align="center" style={styles.emptyState}>
        <AppText variant="body" color="textMuted">
          {message}
        </AppText>
      </Stack>
    );

  const renderReplies = () => {
    if (activity.replies.length === 0 && activity.loading.replies) {
      return renderActivityEmpty('', true, 'reply');
    }
    if (activity.failed.replies && activity.replies.length === 0) {
      return renderLoadError('تعذّر تحميل الردود، اسحب للتحديث');
    }
    if (activity.replies.length === 0) {
      return renderActivityEmpty('لا توجد ردود بعد');
    }
    return activity.replies.map((reply) => (
      <ProfileReplyRow
        key={reply.id}
        reply={reply}
        onPress={() => openPostDetail(router, reply.postId, { replyId: reply.id })}
      />
    ));
  };

  const renderReposts = () => {
    if (activity.reposts.length === 0 && activity.loading.reposts) {
      return renderActivityEmpty('', true);
    }
    if (activity.failed.reposts && activity.reposts.length === 0) {
      return renderLoadError('تعذّر تحميل إعادة النشر، اسحب للتحديث');
    }
    if (activity.reposts.length === 0) {
      return renderActivityEmpty('لا توجد إعادة نشر بعد');
    }
    return activity.reposts.map((post) => renderPost(post, { attribution: true }));
  };

  const renderAds = () => {
    if (userListings.length === 0 && (extrasPending || listingsLoading)) return listingsSkeleton;
    if (listingsLoadFailed && userListings.length === 0) {
      return renderLoadError('تعذّر تحميل الإعلانات، اسحب للتحديث');
    }
    if (userListings.length === 0) {
      return (
        <Stack gap="none" align="center" style={styles.emptyState}>
          <AppText variant="body" color="textMuted">
            لا توجد إعلانات بعد
          </AppText>
        </Stack>
      );
    }

    return (
      <>
        {userListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            variant="list"
            listMode="market"
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
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

  const handleBack = () => {
    const action = resolveProfileBack(router.canGoBack());
    if (action.kind === 'back') router.back();
    else safeReplace(action.href, undefined, router);
  };

  if (!profile) {
    // Same layout instance as the loaded profile (fragment slot 0): toolbar and
    // tabs are real, identity + tab content are skeletons until the user arrives.
    return (
      <>
        <ProfileScreenLayout
          mode="visitor"
          loading
          user={LOADING_PROFILE_USER}
          onBack={handleBack}
          postsContent={postsSkeleton}
          adsContent={listingsSkeleton}
          repliesContent={renderActivityEmpty('', true, 'reply')}
          repostsContent={renderActivityEmpty('', true)}
        />
      </>
    );
  }

  const profileUser: ProfileDisplayUser = {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    arabicName: profile.arabicName,
    avatar: profile.avatar,
    coverImage: profile.coverImage,
    verified: profile.verified,
    verifiedTier: profile.verifiedTier ?? null,
    verifiedSince: profile.verifiedSince ?? null,
    createdAt: profile.createdAt ?? null,
    isAI: profile.isAI,
    bio: profile.bio,
    links: parseProfileLinks(profile.links),
    country: profile.country,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    postsCount: profile.postsCount,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
  };

  const openConnections = (t: 'followers' | 'following') => {
    router.push({
      pathname: '/profile/connections',
      params: { userId: profile.id, tab: t, username: profile.username },
    } as never);
  };

  const handleShareProfile = () => {
    Share.share({
      message: `تفقّد بروفايل ${profile.arabicName || profile.displayName} في تطبيق سرح 🐪\n${sarhProfileShareUrl(profile.username)}`,
      title: 'سرح — المنصة الوطنية للثروة الحيوانية',
    });
  };

  const handleBlock = async () => {
    if (!profile || !accessToken) {
      showAlert('تسجيل الدخول', 'يجب تسجيل الدخول لحظر الحساب');
      return;
    }
    const confirmed = await confirmDestructive(
      'حظر الحساب',
      `لن ترى منشورات وإعلانات ${profile.arabicName || profile.displayName}، ولا يمكنه التواصل معك.`,
      profile.isBlocked ? 'إلغاء الحظر' : 'حظر',
    );
    if (!confirmed) return;

    const result = await setBlockUser(profile.id, !(profile.isBlocked ?? false));
    if (!result.ok) {
      await alertMessage(
        profile.isBlocked ? 'تعذر إلغاء الحظر' : 'تعذر حظر المستخدم',
        result.message,
        'close-circle-outline',
      );
      return;
    }
    setProfile((prev) => (prev ? { ...prev, isBlocked: result.blocked, isFollowing: false, followsYou: false } : prev));
    if (result.blocked) {
      void showToast('تم حظر الحساب', 'success');
      router.back();
      return;
    }
    void showToast('تم إلغاء الحظر', 'info');
  };

  const handleMute = async (muted: boolean) => {
    if (!profile || !accessToken) {
      await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لكتم الحساب');
      return;
    }
    const result = await setMuteUser(profile.id, !muted);
    if (!result.ok) {
      await alertMessage('تعذّر الحفظ', result.message ?? 'حاول مجدداً');
      return;
    }
    void showToast(muted ? 'تم إلغاء الكتم' : 'تم كتم الحساب، لن ترى منشوراته وقصصه', 'success');
  };

  const handleMenu = async () => {
    // Muted state is only needed for the menu label: read it when the menu opens.
    const mutedList = accessToken ? await fetchMutedUsers() : null;
    const isMuted = !!mutedList?.some((u) => u.id === profile.id);
    const key = await presentActionSheet({
      title: 'خيارات',
      message: profile.arabicName || profile.displayName,
      items: [
        MEMBER_OF_MENU_ITEM,
        {
          key: 'share',
          label: 'مشاركة الملف',
          icon: SHARE_ICON,
        },
        ...(accessToken
          ? [
              {
                key: 'mute',
                label: isMuted ? 'إلغاء الكتم' : 'كتم الحساب',
                icon: 'volume-mute-outline',
              },
            ]
          : []),
        {
          key: 'block',
          label: profile.isBlocked ? 'إلغاء الحظر' : 'حظر الحساب',
          icon: 'block',
          destructive: true,
        },
        {
          key: 'report',
          label: 'إبلاغ',
          icon: 'flag-outline',
          destructive: true,
        },
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ],
    });
    if (key === MEMBER_OF_MENU_ITEM.key) openMemberOfCollections(router, profile.id);
    if (key === 'share') handleShareProfile();
    if (key === 'mute') void handleMute(isMuted);
    if (key === 'block') void handleBlock();
    if (key === 'report') promptReport('user', profile.id, !!accessToken);
  };

  return (
    <>
      <ProfileScreenLayout
        mode="visitor"
        user={profileUser}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onBack={handleBack}
        onShare={handleShareProfile}
        onMenu={() => void handleMenu()}
        onFollowersPress={() => openConnections('followers')}
        onFollowingPress={() => openConnections('following')}
        onFollow={handleFollow}
        onMessage={profile.allowPrivateMessages === false ? undefined : handleChat}
        onRatePress={() => {
          if (!accessToken) {
            showAlert('تسجيل الدخول', 'يجب تسجيل الدخول لتقييم الحساب');
            return;
          }
          setRatingVisible(true);
        }}
        followLoading={followLoading}
        isFollowing={profile.isFollowing}
        followsYou={profile.followsYou === true}
        postsContent={renderPosts()}
        adsContent={renderAds()}
        repliesContent={renderReplies()}
        repostsContent={renderReposts()}
        onTabChange={onTabChange}
        onAdsNearEnd={() => void loadNextPage()}
      />

      <RatingModal
        visible={ratingVisible}
        onClose={() => setRatingVisible(false)}
        targetName={profile.arabicName || profile.displayName}
        currentRating={profile.rating}
        currentCount={profile.reviewCount}
        myRating={profile.myRating ?? null}
        onSubmit={async (rating) => {
          const result = await rateUser(profile.id, rating);
          if (!result) return false;
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  rating: result.rating,
                  reviewCount: result.reviewCount,
                  myRating: result.myRating,
                }
              : prev,
          );
          return true;
        }}
      />
    </>
  );
}
