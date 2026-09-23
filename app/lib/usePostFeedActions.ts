import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { openPostDetail } from '@/lib/openPost';
import { recordPostView } from '@/lib/postEngagement';
import type { Post } from '@/services/types';

export function usePostFeedActions() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const {
    me,
    likedPosts,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    setPostViews,
    deletePost,
  } = useApp();

  const enrich = useCallback(
    (post: Post): Post => ({
      ...post,
      liked: likedPosts.has(post.id) || post.liked,
      bookmarked: bookmarkedPosts.has(post.id) || post.bookmarked,
      reposted: repostedPosts.has(post.id) || post.reposted,
    }),
    [likedPosts, bookmarkedPosts, repostedPosts],
  );

  const bind = useCallback(
    (post: Post) => ({
      onPress: () => openPostDetail(router, post.id),
      onLike: () => {
        if (requireAuth(isAuthenticated, 'الإعجاب')) void toggleLike(post.id);
      },
      onRepost: () => {
        if (requireAuth(isAuthenticated, 'إعادة النشر')) void toggleRepost(post.id);
      },
      onComment: () => openPostDetail(router, post.id, { focusComment: isAuthenticated }),
      onBookmark: () => {
        if (requireAuth(isAuthenticated, 'الحفظ')) void toggleBookmark(post.id);
      },
      onShare: () => {
        void sharePost(post);
      },
      onMenu: () => {
        void showPostMenu(post, me, router, deletePost, isAuthenticated);
      },
      onViewsChange: (views: number) => setPostViews(post.id, views),
    }),
    [
      router,
      isAuthenticated,
      toggleLike,
      toggleRepost,
      toggleBookmark,
      setPostViews,
      deletePost,
      me,
    ],
  );

  const observe = useCallback(
    (postId: string) => {
      void recordPostView(postId).then((count) => {
        if (typeof count === 'number') setPostViews(postId, count);
      });
    },
    [setPostViews],
  );

  return { enrich, bind, observe };
}
