import { CommentRowSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { FounderBadge } from '@/components/ui/FounderBadge';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { InteractionAction } from '@/components/ui/InteractionActions';
import {
  POST_HANDLE_FLEX_SHRINK,
  POST_HANDLE_MIN_WIDTH,
  POST_ITEM_LAYOUT,
  POST_META_FONT_SIZE,
  POST_META_LINE_HEIGHT,
} from '@/components/feature/postItemLayout';
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
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { resolveAppFontFace } from '@/constants/fonts';
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
import { avatarUrl } from '@/lib/listingMedia';

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
  /** Reply to a comment: focus the composer with «@username » in front. */
  startReply: (username: string) => void;
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
    verifiedTier?: string | null;
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
      verifiedTier: c.author.verifiedTier ?? null,
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

    const startReply = useCallback(
      (username: string) => {
        if (!isAuthenticated) {
          void alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لإضافة تعليق', 'log-in-outline');
          return;
        }
        const mention = username ? `@${username} ` : '';
        if (mention) setText((prev) => (prev.startsWith(mention) ? prev : `${mention}${prev}`));
        inputRef?.focus();
      },
      [isAuthenticated, inputRef],
    );

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
        startReply,
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
        startReply,
      ],
    );

    return <CommentsCtx.Provider value={api}>{children}</CommentsCtx.Provider>;
  },
);

export function PostCommentsList() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c, scheme }) => createStyles(c, scheme));
  const {
    comments,
    loading,
    loadError,
    loadComments,
    handleDelete,
    startReply,
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
    return <CommentsSkeleton />;
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

  // No comments: render nothing (no empty-state copy, no gap).
  if (comments.length === 0) return null;

  // Replies start right under the post's action-row hairline: no title, no spacer.
  return (
    <View testID="post-replies">
      {orderedComments.map((c) => (
        <View
          key={c.id}
          style={[
            styles.commentWrap,
            highlightCommentId === c.id ? styles.commentHighlight : null,
          ]}
        >
          {/* Same row as a feed post: avatar, one-line name · @handle · time, ⋮, text, actions. */}
          <View style={[styles.commentRow, getRtlRow()]}>
            <UserProfileLink userId={c.author.id}>
              <Image source={uriSource(avatarUrl(c.author.avatar))} style={styles.avatar} contentFit="cover" />
            </UserProfileLink>
            <View style={styles.commentMain}>
              <View style={[styles.commentHeader, getRtlRow()]}>
                <UserProfileLink userId={c.author.id} style={styles.commentMeta}>
                  <View style={[styles.nameTimeRow, getRtlRow()]}>
                    <AppText style={styles.commentName} numberOfLines={1}>
                      {c.author.arabicName || c.author.displayName}
                    </AppText>
                    {c.author.verified ? <VerificationBadge size={14} tier={c.author.verifiedTier} /> : null}
                    <FounderBadge username={c.author.username} verificationBadgeSize={14} />
                    {c.author.username ? (
                      <AppText style={styles.commentHandle} numberOfLines={1} ellipsizeMode="tail">
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
                      <AppIcon name="ellipsis-vertical" size={18} color={colors.textMuted} />
                    )}
                  </Pressable>
                ) : null}
              </View>
              <AppText style={styles.commentText}>{c.content}</AppText>
              {/* Feed-size reply action (comments have no likes/reposts/bookmarks). */}
              <View style={[styles.commentActions, getRtlRow()]}>
                <View style={[styles.commentActionSlot, getRtlRow()]}>
                  <InteractionAction
                    icon="chatbubble-ellipses-outline"
                    color={colors.textSecondary}
                    onPress={() => startReply(c.author.username)}
                    label={`رد على ${c.author.arabicName || c.author.displayName || c.author.username}`}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** First load of comments: rows shaped like the real comment rows (no spinner). */
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonRegion>
      {Array.from({ length: count }, (_, i) => (
        <CommentRowSkeleton key={i} lines={i === 1 ? 2 : 1} />
      ))}
    </SkeletonRegion>
  );
}

export function PostCommentsComposer() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c, scheme }) => createStyles(c, scheme));
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

  // X reply bar: avatar at the inline start, pill input, primary «رد» pill at the end.
  return (
    <View style={[styles.composer, getRtlRow()]} testID="post-reply-composer">
      <Image source={uriSource(avatarUrl(composerAvatar))} style={styles.composerAvatar} contentFit="cover" />
      <View style={styles.inputPill}>
        <TextInput
          ref={setInputRef}
          style={styles.input}
          placeholder={isAuthenticated ? 'انشر ردك' : 'سجّل الدخول للتعليق'}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          editable={isAuthenticated && !sending && !loadError}
          multiline
          maxLength={500}
        />
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.sendBtn,
          disabled && styles.sendBtnDisabled,
          pressed && !disabled ? styles.sendBtnPressed : null,
        ]}
        onPress={() => void handleSend()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="إرسال التعليق"
        accessibilityState={{ disabled, busy: sending }}
      >
        {sending ? (
          <ActivityIndicator size="small" color={colors.onElectric} />
        ) : (
          <AppText style={styles.sendBtnText}>رد</AppText>
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

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  /** Same surface as the post above (PostItem rowWrap): white in Light, page black in Dark. */
  const rowBg = scheme === 'light' ? colors.bgSurface : colors.bgDeep;
  return StyleSheet.create({
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
      borderBottomColor: colors.borderStrong,
      backgroundColor: rowBg,
    },
    commentHighlight: {
      backgroundColor: colors.bgElevated,
    },
    commentRow: {
      alignItems: 'flex-start',
      gap: POST_ITEM_LAYOUT.rowGap,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    avatar: {
      width: POST_ITEM_LAYOUT.avatar,
      height: POST_ITEM_LAYOUT.avatar,
      borderRadius: POST_ITEM_LAYOUT.avatar / 2,
      backgroundColor: colors.bgSurface,
    },
    commentMain: {
      flex: 1,
      minWidth: 0,
    },
    commentActions: {
      marginTop: 2,
    },
    commentActionSlot: {
      width: 56,
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
    /** One line like the feed header: the handle shrinks to «@…» first. */
    nameTimeRow: {
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 4,
      minWidth: 0,
      maxWidth: '100%',
    },
    commentName: {
      ...typography.cardHeading,
      ...resolveAppFontFace('600'),
      color: colors.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    commentHandle: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      fontSize: POST_META_FONT_SIZE,
      lineHeight: POST_META_LINE_HEIGHT,
      color: colors.textSecondary,
      flexShrink: POST_HANDLE_FLEX_SHRINK,
      minWidth: POST_HANDLE_MIN_WIDTH,
      /** «@username» is Latin: LTR so «@» leads, as in the feed and profile header. */
      writingDirection: 'ltr',
    },
    metaDot: {
      ...typography.caption,
      color: colors.textSubtle,
      flexShrink: 0,
    },
    commentTime: {
      ...typography.caption,
      ...resolveAppFontFace('400'),
      fontSize: POST_META_FONT_SIZE,
      lineHeight: POST_META_LINE_HEIGHT,
      color: colors.textSecondary,
      flexShrink: 0,
    },
    commentText: {
      ...typography.body,
      ...resolveAppFontFace('400'),
      color: colors.textPrimary,
      marginTop: POST_ITEM_LAYOUT.bodyMarginTop,
    },
    moreBtn: {
      width: POST_ITEM_LAYOUT.menuButton,
      height: POST_ITEM_LAYOUT.menuButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Page background + one top hairline (X reply bar). */
    composer: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderStrong,
      backgroundColor: rowBg,
    },
    composerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bgField,
    },
    /** Fully rounded field well, no border. */
    inputPill: {
      flex: 1,
      minWidth: 0,
      minHeight: 40,
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: colors.bgField,
      paddingHorizontal: 16,
    },
    input: {
      maxHeight: 100,
      paddingHorizontal: 0,
      paddingVertical: 9,
      ...typography.secondary,
      ...resolveAppFontFace('400'),
      color: colors.textPrimary,
    },
    /** Primary pill: black/white text in Light, white/black text in Dark. */
    sendBtn: {
      minWidth: 52,
      height: 34,
      paddingHorizontal: 16,
      borderRadius: radius.pill,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnText: {
      ...typography.secondary,
      ...resolveAppFontFace('700'),
      color: colors.onElectric,
    },
    sendBtnPressed: {
      opacity: 0.85,
    },
    /** Empty / sending / signed out: low-contrast pill. */
    sendBtnDisabled: {
      opacity: 0.35,
    },
  });
}
