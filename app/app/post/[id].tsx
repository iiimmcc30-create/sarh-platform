// Powered by OnSpace.AI
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PostItem } from '@/components/feature/PostItem';
import {
  PostCommentsComposer,
  PostCommentsList,
  PostCommentsProvider,
  type PostCommentsSectionRef,
} from '@/components/feature/PostCommentsSection';
import { Screen, ScreenBody } from '@/design-system/layout';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { Post } from '@/services/types';
import { mapPostFromApi } from '@/services/posts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
} from 'react-native';
import { ComposerKeyboardView } from '@/components/ui/ComposerKeyboardView';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';


export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ id: string; focusComment?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const focusComment = Array.isArray(params.focusComment)
    ? params.focusComment[0]
    : params.focusComment;
  const postId = id ? decodeURIComponent(id) : '';
  const router = useRouter();
  const { keyboardVisible, restingBottom } = useComposerKeyboardPad();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const {
    me,
    posts,
    likedPosts,
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
      if (!cached) {
        Alert.alert('غير موجود', 'تعذّر العثور على هذا المنشور');
        router.back();
      }
    } catch {
      if (!cached) {
        Alert.alert('خطأ', 'تعذّر تحميل المنشور');
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, [postId, cached, router]);

  useEffect(() => {
    if (cached) setPost(cached);
    void loadPost();
  }, [postId, cached, loadPost]);

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
        <ScreenBody scroll={false}>
          <View style={styles.center}>
            <ActivityIndicator color={colors.electricBright} size="large" />
          </View>
        </ScreenBody>
      </Screen>
    );
  }

  if (!enrichedPost) return null;

  return (
    <Screen edges={['top']}>
      <ScreenHeader variant="screen" title="منشور" showBack />
      <PostCommentsProvider
        ref={commentsRef}
        postId={enrichedPost.id}
        postOwnerId={enrichedPost.author.id}
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
              onLike={() => requireAuth(isAuthenticated, 'الإعجاب') && void toggleLike(enrichedPost.id)}
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
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
