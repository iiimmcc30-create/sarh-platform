// Powered by OnSpace.AI
import { PostDetailSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PostItem } from '@/components/feature/PostItem';
import {
  CommentsSkeleton,
  PostCommentsComposer,
  PostCommentsList,
  PostCommentsProvider,
  type PostCommentsSectionRef,
} from '@/components/feature/PostCommentsSection';
import { Screen, ScreenBody } from '@/design-system/layout';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { recordPostView } from '@/lib/postEngagement';
import { isLikePending, nextLikeState } from '@/lib/postLikeToggle';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { Post } from '@/services/types';
import { mapPostFromApi } from '@/services/posts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
} from 'react-native';
import { ComposerKeyboardView } from '@/components/ui/ComposerKeyboardView';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';


export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ id: string; focusComment?: string; replyId?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const focusComment = Array.isArray(params.focusComment)
    ? params.focusComment[0]
    : params.focusComment;
  const replyIdRaw = Array.isArray(params.replyId) ? params.replyId[0] : params.replyId;
  const replyId = replyIdRaw ? decodeURIComponent(replyIdRaw) : '';
  const postId = id ? decodeURIComponent(id) : '';
  const router = useRouter();
  const { keyboardVisible, restingBottom } = useComposerKeyboardPad();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const {
    me,
    posts,
    likedPosts,
    pendingLikes,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    setPostViews,
    deletePost,
    addComment,
  } = useApp();

  const cached = posts.find((p) => p.id === postId);
  const [post, setPost] = useState<Post | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const commentsRef = useRef<PostCommentsSectionRef>(null);
  // Read through a ref so optimistic like/repost/bookmark/view patches (which
  // replace the cached object) never recreate loadPost and refetch the post.
  const cachedRef = useRef(cached);
  cachedRef.current = cached;

  useEffect(() => {
    if (!postId) router.back();
  }, [postId, router]);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const res = await authFetch(`${API_BASE}/api/posts/${postId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) {
        const mapped = mapPostFromApi(json.data);
        if (mapped) {
          setPost(mapped);
          return;
        }
      }
      if (!cachedRef.current) {
        Alert.alert('غير موجود', 'تعذّر العثور على هذا المنشور');
        router.back();
      }
    } catch {
      if (!cachedRef.current) {
        Alert.alert('خطأ', 'تعذّر تحميل المنشور');
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  // Fetch once per opened post. Interactions must not refetch (a refetch used
  // to hit GET /posts/:id, which counted a view on every like).
  useEffect(() => {
    if (cachedRef.current) setPost(cachedRef.current);
    void loadPost();
  }, [loadPost]);

  // Keep engagement fields in sync with the shared feed copy without refetching.
  const cachedLiked = cached?.liked;
  const cachedLikes = cached?.likes;
  const cachedReposted = cached?.reposted;
  const cachedReposts = cached?.reposts;
  const cachedBookmarked = cached?.bookmarked;
  const cachedViews = cached?.views;
  const hasCached = Boolean(cached);
  useEffect(() => {
    if (!hasCached) return;
    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked: cachedLiked,
            likes: cachedLikes ?? prev.likes,
            reposted: cachedReposted,
            reposts: cachedReposts ?? prev.reposts,
            bookmarked: cachedBookmarked,
            views: typeof cachedViews === 'number' ? Math.max(cachedViews, prev.views ?? 0) : prev.views,
          }
        : prev,
    );
  }, [
    hasCached,
    cachedLiked,
    cachedLikes,
    cachedReposted,
    cachedReposts,
    cachedBookmarked,
    cachedViews,
  ]);

  // Opening the detail is a display of the post: record it once per post per
  // session (backend also dedupes per viewer). Never tied to interactions.
  useEffect(() => {
    if (!postId) return;
    let active = true;
    void recordPostView(postId).then((count) => {
      if (!active || typeof count !== 'number') return;
      setPost((prev) => (prev ? { ...prev, views: count } : prev));
      setPostViews(postId, count);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened post
  }, [postId]);

  useEffect(() => {
    if (focusComment === '1' && post) {
      const timer = setTimeout(() => commentsRef.current?.focusInput(), 400);
      return () => clearTimeout(timer);
    }
  }, [focusComment, post]);

  const enrichedPost = post
    ? {
        ...post,
        liked: likedPosts.has(post.id) || post.liked,
        bookmarked: bookmarkedPosts.has(post.id) || post.bookmarked,
        reposted: repostedPosts.has(post.id) || post.reposted,
      }
    : null;

  if (loading && !enrichedPost) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader variant="screen" title="منشور" showBack />
        {/* First load: the detail post + comment rows as skeletons in the same body. */}
        <ScreenBody gutter={false} padBottom="xl">
          <SkeletonRegion>
            <PostDetailSkeleton />
          </SkeletonRegion>
          <CommentsSkeleton />
        </ScreenBody>
      </Screen>
    );
  }

  if (!enrichedPost) return null;

  const likePending = pendingLikes.has(enrichedPost.id);
  const onLikeDetail = () => {
    if (!requireAuth(isAuthenticated, 'الإعجاب')) return;
    if (isLikePending(enrichedPost.id)) return;
    const snapshot = { liked: Boolean(enrichedPost.liked), likes: enrichedPost.likes };
    // Local copy (may not be in the shared feed) moves optimistically with the context.
    setPost((prev) => (prev ? { ...prev, ...nextLikeState(snapshot) } : prev));
    void toggleLike(enrichedPost.id, snapshot).then((result) => {
      const settled = result ?? snapshot;
      setPost((prev) =>
        prev ? { ...prev, liked: settled.liked, likes: settled.likes } : prev,
      );
    });
  };

  return (
    <Screen edges={['top']}>
      <ScreenHeader variant="screen" title="منشور" showBack />
      <PostCommentsProvider
        ref={commentsRef}
        postId={enrichedPost.id}
        postOwnerId={enrichedPost.author.id}
        highlightCommentId={replyId || undefined}
        onSubmitComment={(content) => addComment(enrichedPost.id, content)}
        onCommentAdded={() => {
          setPost((prev) => (prev ? { ...prev, comments: prev.comments + 1 } : prev));
        }}
      >
        <ComposerKeyboardView style={styles.flex}>
          <ScreenBody gutter={false} padBottom="xl">
            <PostItem
              post={enrichedPost}
              variant="detail"
              onLike={onLikeDetail}
              likePending={likePending}
              onRepost={() =>
                requireAuth(isAuthenticated, 'إعادة النشر') && void toggleRepost(enrichedPost.id)
              }
              onComment={() => commentsRef.current?.focusInput()}
              onBookmark={() =>
                requireAuth(isAuthenticated, 'الحفظ') && void toggleBookmark(enrichedPost.id)
              }
              onShare={() => sharePost(enrichedPost)}
              onViewsChange={(views) => setPostViews(enrichedPost.id, views)}
              onMenu={() =>
                showPostMenu(enrichedPost, me, router, deletePost, isAuthenticated)
              }
            />
            <PostCommentsList />
          </ScreenBody>
          <View
            style={{
              paddingBottom: keyboardVisible ? 0 : restingBottom,
            }}
          >
            <PostCommentsComposer />
          </View>
        </ComposerKeyboardView>
      </PostCommentsProvider>
    </Screen>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
  });
}
