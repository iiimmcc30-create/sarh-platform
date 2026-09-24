import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  forwardRef,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { deletePostComment } from '@/services/comments';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { canDeleteComment } from '@/lib/currentUser';
import { showToast } from '@/lib/toast';
import { useAppUser } from '@/hooks/useApp';
import { getRtlRow } from '@/lib/rtl';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import type { PostComment } from '@/services/types';

type PostCommentsSectionProps = {
  postId: string;
  postOwnerId?: string;
  highlightCommentId?: string;
  showInput?: boolean;
  onCommentAdded?: () => void;
  onSubmitComment?: (content: string) => Promise<boolean>;
  children?: ReactNode;
};

export type PostCommentsSectionRef = {
  reload: () => Promise<void>;
  focusInput: () => void;
};

type CommentsApi = {
  comments: PostComment[];
  loading: boolean;
  loadError: string | null;
  text: string;
  setText: (v: string) => void;
  sending: boolean;
  deletingId: string | null;
  setInputRef: (ref: TextInput | null) => void;
  loadComments: () => Promise<void>;
  handleSend: () => Promise<void>;
  handleDelete: (commentId: string) => Promise<void>;
  postOwnerId?: string;
  highlightCommentId?: string;
  isAuthenticated: boolean;
  user: ReturnType<typeof useAuth>['user'];
  me: ReturnType<typeof useAppUser>['me'];
  composerAvatar?: string;
};

const CommentsCtx = createContext<CommentsApi | null>(null);

function useCommentsApi(): CommentsApi {
  const ctx = useContext(CommentsCtx);
  if (!ctx) {
    throw new Error('Post comments UI must be inside PostCommentsProvider');
  }
  return ctx;
}

function mapComment(c: {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    arabicName: string;
    avatar?: string | null;
    verified?: boolean;
  };
}): PostComment {
  return {
    id: c.id,
    content: c.content,
    createdAt: formatRelativeTimeAr(c.createdAt) || new Date(c.createdAt).toLocaleString('ar-SA'),
    author: {
      id: c.author.id,
      username: c.author.username,
      displayName: c.author.displayName || '',
      arabicName: c.author.arabicName || '',
      avatar: c.author.avatar ?? undefined,
      verified: c.author.verified ?? false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
  };
}

export const PostCommentsProvider = forwardRef<PostCommentsSectionRef, PostCommentsSectionProps>(
  function PostCommentsProvider(
    { postId, postOwnerId, highlightCommentId, onCommentAdded, onSubmitComment, children },
    ref,
  ) {
    const { isAuthenticated, user } = useAuth();
    const { me } = useAppUser();
    const [comments, setComments] = useState<PostComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [inputRef, setInputRef] = useState<TextInput | null>(null);

    const handleDelete = useCallback(async (commentId: string) => {
      const confirmed = await confirmDestructive(
        'حذف التعليق',
        'هل تريد حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء.',
        'حذف التعليق',
      );
      if (!confirmed) return;

      setDeletingId(commentId);
      const result = await deletePostComment(postId, commentId);
      setDeletingId(null);
      if (!result.ok) {
        await alertMessage('تعذر حذف التعليق', result.message, 'close-circle-outline');
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentAdded?.();
      void showToast('تم حذف التعليق', 'success');
    }, [postId, onCommentAdded]);

    const loadComments = useCallback(async () => {
      if (!postId) return;
      setLoadError(null);
      try {
        const res = await fetch(`${API_BASE}/api/posts/${postId}/comments`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          const rows = Array.isArray(json.data?.comments) ? json.data.comments : [];
          setComments(rows.map(mapComment));
          return;
        }
        setLoadError(json.messageAr ?? json.message ?? 'تعذّر تحميل التعليقات');
      } catch (err) {
        console.warn('[PostComments] load failed:', err);
        setLoadError('تعذّر تحميل التعليقات — تحقق من الاتصال');
      } finally {
        setLoading(false);
      }
    }, [postId]);

    useEffect(() => {
      setComments([]);
      setLoadError(null);
      setLoading(true);
    }, [postId]);

    useEffect(() => {
      void loadComments();
    }, [loadComments]);

    useImperativeHandle(ref, () => ({
      reload: loadComments,
      focusInput: () => inputRef?.focus(),
    }), [loadComments, inputRef]);

    const handleSend = useCallback(async () => {
      if (!isAuthenticated) {
        await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لإضافة تعليق', 'log-in-outline');
        return;
      }
      if (!text.trim() || sending) return;

      setSending(true);
      try {
        const ok = onSubmitComment
          ? await onSubmitComment(text.trim())
          : await (async () => {
              const res = await authFetch(`${API_BASE}/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text.trim() }),
              });
              const json = await res.json().catch(() => ({}));
              return res.ok && json.success;
            })();
        if (ok) {
          setText('');
          await loadComments();
          onCommentAdded?.();
          void showToast('تم إرسال التعليق', 'success');
        } else {
          await alertMessage('تعذّر الإرسال', 'حاول مرة أخرى', 'alert-circle-outline');
        }
      } catch {
        await alertMessage('خطأ', 'تعذّر إرسال التعليق', 'close-circle-outline');
      } finally {
        setSending(false);
      }
    }, [isAuthenticated, text, sending, onSubmitComment, postId, onCommentAdded, loadComments]);

    const api = useMemo<CommentsApi>(
      () => ({
        comments,
        loading,
        loadError,
        text,
        setText,
        sending,
        deletingId,
        setInputRef,
        loadComments,
        handleSend,
        handleDelete,
        postOwnerId,
        highlightCommentId,
        isAuthenticated,
        user,
        me,
        composerAvatar: me?.avatar ?? user?.avatar,
      }),
      [
        comments,
        loading,
        loadError,
        text,
        sending,
        deletingId,
        loadComments,
        postOwnerId,
        highlightCommentId,
        isAuthenticated,
        user,
        me,
        handleSend,
        handleDelete,
      ],
    );

    return <CommentsCtx.Provider value={api}>{children}</CommentsCtx.Provider>;
  },
);

export function PostCommentsList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const {
    comments,
    loading,
    loadError,
    loadComments,
    handleDelete,
    deletingId,
    postOwnerId,
    highlightCommentId,
    user,
    me,
  } = useCommentsApi();

  const orderedComments = useMemo(() => {
    if (!highlightCommentId) return comments;
    const focused = comments.find((c) => c.id === highlightCommentId);
    if (!focused) return comments;
    return [focused, ...comments.filter((c) => c.id !== highlightCommentId)];
  }, [comments, highlightCommentId]);

  if (loading && comments.length === 0) {
    return <ActivityIndicator color={colors.electricBright} style={styles.loader} />;
  }

  if (loadError && comments.length === 0) {
    return (
      <View style={styles.errorBox}>
        <AppText style={styles.errorText}>{loadError}</AppText>
        <Pressable onPress={() => void loadComments()} style={styles.retryBtn}>
          <AppText style={styles.retryText}>إعادة المحاولة</AppText>
        </Pressable>
      </View>
    );
  }

  if (comments.length === 0) {
    return <AppText style={styles.empty}>لا توجد تعليقات بعد — كن أول من يعلّق</AppText>;
  }

  return (
    <View>
      {orderedComments.map((c) => (
        <View
          key={c.id}
          style={[
            styles.commentWrap,
            highlightCommentId === c.id ? styles.commentHighlight : null,
          ]}
        >
          <View style={[styles.commentRow, getRtlRow()]}>
            <UserProfileLink userId={c.author.id}>
              <Image source={uriSource(c.author.avatar)} style={styles.avatar} contentFit="cover" />
            </UserProfileLink>
            <View style={styles.commentMain}>
              <View style={[styles.commentHeader, getRtlRow()]}>
                <UserProfileLink userId={c.author.id} style={styles.commentMeta}>
                  <View style={[styles.nameTimeRow, getRtlRow()]}>
                    <AppText style={styles.commentName} numberOfLines={1}>
                      {c.author.arabicName || c.author.displayName}
                    </AppText>
                    {c.author.verified ? <VerificationBadge size={13} /> : null}
                    {c.author.username ? (
                      <AppText style={styles.commentHandle} numberOfLines={1}>
                        @{c.author.username}
                      </AppText>
                    ) : null}
                    <AppText style={styles.metaDot}>·</AppText>
                    <AppText style={styles.commentTime} numberOfLines={1}>
                      {c.createdAt}
                    </AppText>
                  </View>
                </UserProfileLink>
                {canDeleteComment(c.author.id, postOwnerId, user, me) ? (
                  <Pressable
                    onPress={() => void handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="المزيد"
                    style={styles.moreBtn}
                  >
                    {deletingId === c.id ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <AppIcon name="ellipsis-vertical" size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                ) : null}
              </View>
              <AppText style={styles.commentText}>{c.content}</AppText>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function PostCommentsComposer() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const {
    text,
    setText,
    sending,
    loadError,
    setInputRef,
    handleSend,
    isAuthenticated,
    composerAvatar,
  } = useCommentsApi();

  const disabled = !text.trim() || sending || !isAuthenticated || !!loadError;

  return (
    <View style={[styles.composer, getRtlRow()]}>
      <Image source={uriSource(composerAvatar)} style={styles.composerAvatar} contentFit="cover" />
      <TextInput
        ref={setInputRef}
        style={styles.input}
        placeholder={isAuthenticated ? 'اكتب تعليقاً...' : 'سجّل الدخول للتعليق'}
        placeholderTextColor={colors.textSubtle}
        value={text}
        onChangeText={setText}
        editable={isAuthenticated && !sending && !loadError}
        multiline
        maxLength={500}
      />
      <Pressable
        style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
        onPress={() => void handleSend()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="إرسال التعليق"
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <AppIcon name="send" size={16} color="#fff" />
        )}
      </Pressable>
    </View>
  );
}

/** Compatible wrapper: list + composer (inline). Prefer split layout on detail. */
export const PostCommentsSection = forwardRef<PostCommentsSectionRef, PostCommentsSectionProps>(
  function PostCommentsSection({ showInput = true, children, ...props }, ref) {
    return (
      <PostCommentsProvider ref={ref} {...props}>
        {children ?? (
          <>
            <PostCommentsList />
            {showInput ? <PostCommentsComposer /> : null}
          </>
        )}
      </PostCommentsProvider>
    );
  },
);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: {
      paddingVertical: spacing.lg,
    },
    empty: {
      ...typography.feedBody,
      color: colors.textMuted,
      lineHeight: 22,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.lg,
    },
    errorBox: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    errorText: {
      ...typography.feedBody,
      color: colors.rose,
      lineHeight: 22,
    },
    retryBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    retryText: {
      ...typography.feedTitle,
      color: colors.electricBright,
    },
    commentWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
      backgroundColor: colors.bgDeep,
    },
    commentHighlight: {
      backgroundColor: colors.bgElevated,
    },
    commentRow: {
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bgSurface,
    },
    commentMain: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    commentHeader: {
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    commentMeta: {
      flex: 1,
      minWidth: 0,
    },
    nameTimeRow: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      minWidth: 0,
    },
    commentName: {
      ...typography.feedTitle,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    commentHandle: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 1,
    },
    metaDot: {
      ...typography.caption,
      color: colors.textSubtle,
      flexShrink: 0,
    },
    commentTime: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 0,
    },
    commentText: {
      ...typography.feedBody,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    moreBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    composer: {
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.bgDeep,
    },
    composerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bgSurface,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      paddingHorizontal: 0,
      paddingVertical: 10,
      ...typography.feedBody,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      opacity: 0.45,
    },
  });
}
