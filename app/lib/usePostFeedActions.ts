import { useCallback, useRef } from 'react';
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
    pendingLikes,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    setPostViews,
    deletePost,
  } = useApp();

  // PostItem is memoized on post fields only, so a row can keep an older
  // handler object. Handlers read the latest auth/actions from this ref so a
  // stale row never runs an outdated toggle (e.g. one created before sign-in).
  const latest = useRef({
    router,
    isAuthenticated,
    me,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    setPostViews,
    deletePost,
  });
  latest.current = {
    router,
    isAuthenticated,
    me,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    setPostViews,
    deletePost,
  };

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
      likePending: pendingLikes.has(post.id),
      onPress: () => openPostDetail(latest.current.router, post.id),
      onLike: () => {
        const l = latest.current;
        // The context reads the current liked/likes itself and ignores taps
        // while a request for this post is in flight.
        if (requireAuth(l.isAuthenticated, 'الإعجاب')) void l.toggleLike(post.id);
      },
      onRepost: () => {
        const l = latest.current;
        if (requireAuth(l.isAuthenticated, 'إعادة النشر')) void l.toggleRepost(post.id);
      },
      onComment: () =>
        openPostDetail(latest.current.router, post.id, {
          focusComment: latest.current.isAuthenticated,
        }),
      onBookmark: () => {
        const l = latest.current;
        if (requireAuth(l.isAuthenticated, 'الحفظ')) void l.toggleBookmark(post.id);
      },
      onShare: () => {
        void sharePost(post);
      },
      onMenu: () => {
        const l = latest.current;
        void showPostMenu(post, l.me, l.router, l.deletePost, l.isAuthenticated);
      },
      onViewsChange: (views: number) => latest.current.setPostViews(post.id, views),
    }),
    [pendingLikes],
  );

  /** Feed impression: recorded once per post per session (viewability only, never on press). */
  const observe = useCallback(
    (postId: string) => {
      void recordPostView(postId).then((count) => {
        if (typeof count === 'number') latest.current.setPostViews(postId, count);
      });
    },
    [],
  );

  return { enrich, bind, observe };
}
