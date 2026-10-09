import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComposerKeyboardView } from '@/components/ui/ComposerKeyboardView';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { getRtlRow, getRtlText } from '@/lib/rtl';
import { alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import type { PostComment } from '@/services/types';
import { AppText } from '@/components/ui/AppText';
import { SkeletonRegion } from '@/components/ui/skeleton';
import { ListingCommentThread, ListingCommentRowSkeleton } from '@/components/feature/ListingCommentRow';
import { groupListingComments } from '@/components/feature/listingCommentsUtils';

type ListingCommentsModalProps = {
  visible: boolean;
  listingId: string;
  comments: PostComment[];
  loading: boolean;
  loadError: string | null;
  rateLimited?: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
  onReload?: () => void;
  /** Listing seller id — their comments get the «البائع» label. */
  sellerId?: string | null;
  /** Open the composer as a reply to this comment («رد» from the section). */
  initialReplyTo?: PostComment | null;
};

export function ListingCommentsModal({
  visible,
  listingId,
  comments,
  loading,
  loadError,
  rateLimited = false,
  onClose,
  onCommentAdded,
  onReload,
  sellerId,
  initialReplyTo = null,
}: ListingCommentsModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const { keyboardVisible, restingBottom } = useComposerKeyboardPad();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [followReplies, setFollowReplies] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const threads = useMemo(() => groupListingComments(comments), [comments]);

  const startReply = (comment: PostComment) => {
    setReplyTo(comment);
    const handle = comment.author.username ? `@${comment.author.username} ` : '';
    setText(handle);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (!visible) return;
    if (initialReplyTo) startReply(initialReplyTo);
    else {
      setReplyTo(null);
      setText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialReplyTo]);

  // Send button: accent fill fades/scales in only when there is something to send.
  const canSend = !!text.trim() && !sending && isAuthenticated && !loadError;
  const sendAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(sendAnim, {
      toValue: canSend || sending ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [canSend, sending, sendAnim]);

  const handleSend = async () => {
    if (!isAuthenticated) {
      await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لإضافة تعليق', 'log-in-outline');
      return;
    }
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      const res = await authFetch(`${API_BASE}/api/listings/${listingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          ...(replyTo ? { parentId: replyTo.id } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setText('');
        setReplyTo(null);
        onCommentAdded?.();
        void showToast('تم إرسال التعليق', 'success');
      } else {
        await alertMessage(
          'تعذّر الإرسال',
          json.messageAr ?? json.message ?? 'حاول مرة أخرى',
          'alert-circle-outline',
        );
      }
    } catch {
      await alertMessage('خطأ', 'تعذّر إرسال التعليق', 'close-circle-outline');
    } finally {
      setSending(false);
    }
  };

  const toggleFollowReplies = () => {
    setFollowReplies((prev) => {
      const next = !prev;
      void showToast(next ? 'تم تفعيل متابعة الردود' : 'تم إيقاف متابعة الردود', 'info');
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ComposerKeyboardView style={styles.root}>
        <View
          style={[
            styles.container,
            {
              paddingTop: Math.max(insets.top, spacing.sm),
            },
          ]}
        >
          <View style={[styles.header, getRtlRow()]}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <AppIcon name="close" size={22} color={colors.textPrimary} />
            </Pressable>

            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText style={styles.headerTitle}>
                عدد التعليقات ({comments.length})
              </AppText>
            </View>

            <Pressable
              onPress={toggleFollowReplies}
              style={[styles.followPill, followReplies && styles.followPillActive]}
            >
              <AppIcon
                name="megaphone-outline"
                size={14}
                color={followReplies ? colors.electricBright : colors.textMuted}
              />
              <Text style={[styles.followPillText, followReplies && styles.followPillTextActive]}>
                متابعة الردود
              </Text>
            </Pressable>
          </View>

          {loading && comments.length === 0 ? (
            // First load: placeholders with the real comment-row geometry.
            <SkeletonRegion style={[styles.list, styles.listContent]}>
              {[0, 1, 2].map((index) => (
                <ListingCommentRowSkeleton key={index} divider={index < 2} wide={index === 1} />
              ))}
            </SkeletonRegion>
          ) : loadError && comments.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{loadError}</Text>
              {!rateLimited ? (
                <Pressable onPress={() => onReload?.()} style={styles.retryBtn}>
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {threads.map((t, index) => (
                <ListingCommentThread
                  key={t.comment.id}
                  thread={t}
                  sellerId={sellerId}
                  divider={index < threads.length - 1}
                  onReply={startReply}
                />
              ))}
            </ScrollView>
          )}

          {replyTo ? (
            <View style={[styles.replyChip, getRtlRow()]}>
              <AppIcon name="chatbubble-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.replyChipText} numberOfLines={1}>
                {`الرد على ${replyTo.author.arabicName || replyTo.author.displayName || replyTo.author.username}`}
              </Text>
              <Pressable
                onPress={() => {
                  setReplyTo(null);
                  setText('');
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="إلغاء الرد"
              >
                <AppIcon name="close" size={15} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          <View
            style={[
              styles.inputRow,
              getRtlRow(),
              {
                paddingBottom: keyboardVisible
                  ? spacing.sm
                  : Math.max(restingBottom, spacing.sm),
              },
            ]}
          >
            <View style={[styles.inputField, getRtlRow()]}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={isAuthenticated ? 'اكتب تعليقك هنا...' : 'سجّل الدخول للتعليق'}
                placeholderTextColor={colors.textSubtle}
                value={text}
                onChangeText={setText}
                editable={isAuthenticated && !sending && !loadError}
                textAlign="right"
                multiline
                maxLength={500}
              />
              <Pressable
                style={styles.sendBtn}
                onPress={() => void handleSend()}
                disabled={!canSend}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="إرسال"
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.sendFill,
                    {
                      opacity: sendAnim,
                      transform: [
                        { scale: sendAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                      ],
                    },
                  ]}
                />
                {sending ? (
                  <ActivityIndicator size="small" color={colors.onElectric} />
                ) : (
                  <AppIcon
                    name="send"
                    size={17}
                    color={canSend ? colors.onElectric : colors.textSubtle}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </ComposerKeyboardView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    container: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    header: {
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...typography.feedTitle,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    followPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
      maxWidth: 120,
    },
    followPillActive: {
      borderColor: colors.electricBright,
      backgroundColor: colors.bgElevated,
    },
    followPillText: {
      ...typography.micro,
      color: colors.textMuted,
    },
    followPillTextActive: {
      color: colors.electricBright,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
    },
    errorText: {
      ...typography.feedBody,
      color: colors.rose,
      textAlign: 'center',
    },
    retryBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    retryText: {
      ...typography.feedTitle,
      color: colors.electricBright,
    },
    list: {
      flex: 1,
      minHeight: 0,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    inputRow: {
      alignItems: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.bgDeep,
    },
    replyChip: {
      alignItems: 'center',
      gap: spacing.xs + 2,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs + 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.bgDeep,
    },
    replyChipText: {
      ...typography.micro,
      color: colors.textSecondary,
      flex: 1,
      minWidth: 0,
      ...getRtlText(),
    },
    inputField: {
      flex: 1,
      alignItems: 'flex-end',
      gap: spacing.xs,
      minHeight: 44,
      paddingStart: spacing.md + 2,
      paddingEnd: 4,
      paddingVertical: 4,
      borderRadius: 22,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
    },
    input: {
      flex: 1,
      minHeight: 36,
      maxHeight: 100,
      paddingVertical: 8,
      paddingHorizontal: 0,
      ...typography.feedBody,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 18,
      backgroundColor: colors.electric,
    },
  });
}
