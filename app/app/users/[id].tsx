// SAFAT — Public User Profile
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet } from 'react-native';
import { AppText } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { space } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';
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
import { SellerListingsPaginationFooter } from '@/components/feature/SellerListingsPaginationFooter';
import { PostItem } from '@/components/feature/PostItem';
import { ProfileScreenLayout, type ProfileDisplayUser } from '@/components/feature/ProfileScreenLayout';
import { RatingModal } from '@/components/feature/RatingModal';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { openPostDetail } from '@/lib/openPost';
import { presentActionSheet, confirmDestructive, alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';

/** Layout only — an empty tab still needs vertical presence in the feed. */
const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
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
  const { colors: themeColors } = useTheme();

  const isOwnProfile = !id || id === me.id;
  const targetId = id || me.id;
  const [profile, setProfile] = useState<PublicUserProfile | null>(() =>
    targetId ? getCachedUserProfile(targetId) : null,
  );
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [postsLoadFailed, setPostsLoadFailed] = useState(false);
  const [listingsLoadFailed, setListingsLoadFailed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingVisible, setRatingVisible] = useState(false);
  const {
    listings: userListings,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadFirstPage,
    loadNextPage,
  } = useSellerListingsPager({ sellerId: isOwnProfile ? null : targetId, accessToken });
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
    await loadProfile(true);
    setRefreshing(false);
  }, [loadProfile]);

  const handleFollow = async () => {
    if (!profile || !accessToken || followLoading) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    setFollowLoading(true);
    try {
      const result = await setFollowUser(profile.id, !profile.isFollowing);
      if (!result) throw new Error('follow_failed');
      await fetchAuthoritativeProfile(true);
    } catch {
      await fetchAuthoritativeProfile(true);
      Alert.alert('خطأ', 'تعذّرت المتابعة، حاول مجدداً');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleChat = () => {
    if (!profile) return;
    if (profile.accountType === 'BUTCHER') {
      Alert.alert('المحادثة', 'التواصل المباشر مع الملحمة غير متاح');
      return;
    }
    if (profile.allowPrivateMessages === false) {
      Alert.alert('الرسائل الخاصة', 'هذا المستخدم لا يقبل الرسائل الخاصة');
      return;
    }
    if (!accessToken) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لبدء محادثة');
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

  const renderPosts = () => {
    if (postsLoadFailed && userPosts.length === 0) {
      return (
        <Stack gap="none" align="center" style={styles.emptyState}>
          <ActivityIndicator color={themeColors.electricBright} />
        </Stack>
      );
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

    return userPosts.map((post) => (
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
        onBookmark={() => requireAuth(isAuthenticated, 'الحفظ') && toggleBookmark(post.id)}
        onShare={() => sharePost(post)}
        onMenu={() => showPostMenu(post, me, router, deletePost, isAuthenticated)}
      />
    ));
  };

  const renderAds = () => {
    if (listingsLoadFailed && userListings.length === 0) {
      return (
        <Stack gap="none" align="center" style={styles.emptyState}>
          <ActivityIndicator color={themeColors.electricBright} />
        </Stack>
      );
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

  if (!profile) {
    return (
      <Screen edges={['top']} pattern={false}>
        <ScreenBody scroll={false} style={styles.centered}>
          <ActivityIndicator size="large" color={themeColors.electricBright} />
        </ScreenBody>
      </Screen>
    );
  }

  const profileUser: ProfileDisplayUser = {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    arabicName: profile.arabicName,
    avatar: profile.avatar,
    verified: profile.verified,
    isAI: profile.isAI,
    bio: profile.bio,
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
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لحظر الحساب');
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
    setProfile((prev) => (prev ? { ...prev, isBlocked: result.blocked, isFollowing: false } : prev));
    if (result.blocked) {
      void showToast('تم حظر الحساب', 'success');
      router.back();
      return;
    }
    void showToast('تم إلغاء الحظر', 'info');
  };

  const handleMenu = async () => {
    const key = await presentActionSheet({
      title: 'خيارات',
      message: profile.arabicName || profile.displayName,
      items: [
        {
          key: 'share',
          label: 'مشاركة الملف',
          icon: 'share-social-outline',
        },
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
    if (key === 'share') handleShareProfile();
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
        onBack={() => router.back()}
        onShare={handleShareProfile}
        onMenu={() => void handleMenu()}
        onFollowersPress={() => openConnections('followers')}
        onFollowingPress={() => openConnections('following')}
        onFollow={handleFollow}
        onMessage={profile.allowPrivateMessages === false ? undefined : handleChat}
        onRatePress={() => {
          if (!accessToken) {
            Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لتقييم الحساب');
            return;
          }
          setRatingVisible(true);
        }}
        followLoading={followLoading}
        isFollowing={profile.isFollowing}
        postsContent={renderPosts()}
        adsContent={renderAds()}
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
