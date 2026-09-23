import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { CoverTrailRow } from '@/components/ui/CoverTrailRow';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { AppText } from '@/components/ui/AppText';

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

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

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
        body: JSON.stringify({ content: text.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setText('');
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

  const focusInput = () => {
    inputRef.current?.focus();
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
            <View style={styles.center}>
              <ActivityIndicator color={colors.electricBright} />
            </View>
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
              {comments.length === 0 ? (
                <View style={{ width: '100%' }}>
                  <AppText style={styles.empty}>لا توجد تعليقات بعد — كن أول من يعلّق</AppText>
                </View>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={styles.commentCard}>
                    <View style={[styles.commentCardHeader, getRtlRow()]}>
                      <Text style={styles.commentTime}>{c.createdAt}</Text>
                      <CoverTrailRow justify="flex-end" gap={6} flex style={styles.commentMeta}>
                        <VerifiedInlineName
                          name={c.author.arabicName || c.author.displayName}
                          verified={c.author.verified}
                          badgeSize={12}
                          nameStyle={styles.commentName}
                        />
                        <UserProfileLink userId={c.author.id}>
                          <Image
                            source={uriSource(c.author.avatar)}
                            style={styles.avatar}
                            contentFit="cover"
                          />
                        </UserProfileLink>
                      </CoverTrailRow>
                    </View>
                    <View style={{ width: '100%' }}>
                      <AppText style={styles.commentText}>{c.content}</AppText>
                    </View>
                    <Pressable onPress={focusInput} style={[styles.replyBtn, getRtlRow()]}>
                      <AppIcon name="chatbubble-outline" size={14} color={colors.electricBright} />
                      <Text style={styles.replyBtnText}>رد</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          )}

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
              style={[
                styles.sendBtn,
                (!text.trim() || sending || !isAuthenticated || !!loadError) && styles.sendBtnDisabled,
              ]}
              onPress={() => void handleSend()}
              disabled={!text.trim() || sending || !isAuthenticated || !!loadError}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <AppIcon name="send" size={18} color="#fff" />
              )}
            </Pressable>
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
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    empty: {
      ...typography.feedBody,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
      lineHeight: 22,
    },
    commentCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    commentCardHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    commentMeta: {
      minWidth: 0,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgElevated,
    },
    commentName: {
      ...typography.micro,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    commentTime: {
      ...typography.micro,
      color: colors.textMuted,
      flexShrink: 0,
    },
    commentText: {
      ...typography.feedBody,
      color: colors.textSecondary,
      lineHeight: 22,
      ...getRtlText(),
    },
    replyBtn: {
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingVertical: 2,
    },
    replyBtnText: {
      ...typography.micro,
      color: colors.electricBright,
      fontWeight: '600',
    },
    inputRow: {
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.bgDeep,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      backgroundColor: colors.bgSurface,
      borderWidth: 1.5,
      borderColor: colors.electricBright,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      ...typography.feedBody,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      opacity: 0.45,
    },
  });
}
