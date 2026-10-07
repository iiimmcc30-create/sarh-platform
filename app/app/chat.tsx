// Powered by OnSpace.AI
// SAFAT — Chat Screen (محادثة سرح)
import { AppIcon } from '@/components/ui/FlaticonIcon';

import { Image, uriSource } from '@/components/ui/AppImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhBackButton, resolveAppTextStyle } from '@/design-system/components';
import { Row, Screen } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { rtlInputText } from '@/lib/rtl';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { ComposerKeyboardView } from '@/components/ui/ComposerKeyboardView';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';
import type { ChatMessage } from '@/services/chatMessages';
import { API_BASE } from '@/services/api';
import { fetchPeerConversation, setThreadMuted } from '@/services/chatApi';
import {
  assertUploadSize,
  UploadError,
  uploadMediaFromUri,
  type UploadMediaType,
} from '@/services/upload';
import { VoiceMessageBubble } from '@/components/feature/chat/VoiceMessageBubble';
import { ChatActionsSheet } from '@/components/feature/chat/ChatActionsSheet';
import { MediaViewerModal } from '@/components/ui/MediaViewerModal';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { buildChatRows, type ChatRow } from '@/lib/chatThreadLayout';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import {
  useVoiceRecorder,
  type VoiceRecording,
  type VoiceStopResult,
} from '@/hooks/useVoiceRecorder';
import {
  chatMessageParts,
  formatFileSize,
  formatMediaDuration,
  mapApiMessage,
} from '@/lib/chatMessageModel';
import { getChatBubbleColors, type ChatBubbleColors } from '@/lib/chatBubbleTheme';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUserProfile, setBlockUser } from '@/services/users';
import {
  applyChatSocketEvent,
  mergeChatMessages,
  parseChatSocketPayload,
  reconcileLoadedMessages,
} from '@/lib/chatRealtime';
import { useChatThreadSocket } from '@/hooks/useChatThreadSocket';
import {
  applyInboxThreadPreview,
  inboxPreviewText,
  markInboxThreadRead,
  setInboxThreadMuted,
} from '@/hooks/useMessageThreads';
import {
  formatOfferMessage,
  parseOfferMessage,
} from '@/lib/messageOffers';
import * as Location from 'expo-location';

/** Media picked or recorded locally, waiting for upload (enables retry). */
type OutgoingMedia = {
  kind: UploadMediaType;
  uri: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  /**
   * Voice notes: deletes the native temp file / revokes the web object URL.
   * Called once the upload succeeded, on a final (non-retryable) failure,
   * and for abandoned jobs when the screen unmounts — never mid-upload.
   */
  dispose?: () => void;
  /** Set after a successful upload so a retry only re-sends the message. */
  uploadedUrl?: string;
};

/** Send failure that retrying cannot fix (validation, size, forbidden). */
class FinalSendError extends Error {}

const FINAL_SEND_STATUSES = new Set([400, 403, 404, 413, 422]);

/** Upload + send payload per kind (legacy image/video fields kept). */
function mediaSendPayload(media: OutgoingMedia, url: string) {
  if (media.kind === 'audio') {
    return {
      messageType: 'VOICE' as const,
      audioUrl: url,
      durationMs: Math.max(1, Math.round(media.durationMs ?? 1)),
      ...(media.mimeType ? { mediaMimeType: media.mimeType } : {}),
      ...(media.sizeBytes ? { mediaSizeBytes: Math.round(media.sizeBytes) } : {}),
    };
  }
  if (media.kind === 'video') {
    return {
      videoUrl: url,
      ...(media.durationMs ? { durationMs: Math.round(media.durationMs) } : {}),
    };
  }
  return { imageUrl: url };
}

type SendMediaPayload = ReturnType<typeof mediaSendPayload>;

type ChatMessageStyles = ReturnType<typeof createMessageStyles>;
type ChatScreenStyles = ReturnType<typeof createStyles>;

type ChatMessageBubbleProps = {
  item: ChatMessage;
  myId: string;
  /** Same sender as the previous / next bubble (WhatsApp-style grouping). */
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
  onRespondToOffer: (accept: boolean) => void;
  onRetry: (id: string) => void;
  /** Opens the existing full-screen Media Viewer for an image. */
  onOpenImage: (uri: string) => void;
  messageStyles: ChatMessageStyles;
  colors: ThemeColors;
  /** Scheme-aware thread palette (white thread in Light, black in Dark). */
  palette: ChatBubbleColors;
};

function chatMessagePropsEqual(prev: ChatMessageBubbleProps, next: ChatMessageBubbleProps) {
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.image === b.image &&
    a.video === b.video &&
    a.audio === b.audio &&
    a.durationMs === b.durationMs &&
    a.status === b.status &&
    a.progress === b.progress &&
    a.error === b.error &&
    a.read === b.read &&
    a.senderId === b.senderId &&
    a.createdAt === b.createdAt &&
    prev.myId === next.myId &&
    prev.groupedWithPrev === next.groupedWithPrev &&
    prev.groupedWithNext === next.groupedWithNext &&
    prev.onRespondToOffer === next.onRespondToOffer &&
    prev.onRetry === next.onRetry &&
    prev.onOpenImage === next.onOpenImage &&
    prev.messageStyles === next.messageStyles &&
    prev.colors === next.colors &&
    prev.palette === next.palette
  );
}

const ChatMessageBubble = memo(function ChatMessageBubble({
  item,
  myId,
  groupedWithNext,
  onRespondToOffer,
  onRetry,
  onOpenImage,
  messageStyles,
  colors,
  palette,
}: ChatMessageBubbleProps) {
  const isMe = item.senderId === myId;
  const [imageFailed, setImageFailed] = useState(false);
  const offer = parseOfferMessage(item.text);
  const timeLabel = new Date(item.createdAt).toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (offer) {
    return (
      <View
        style={[
          messageStyles.bubbleWrap,
          isMe ? messageStyles.bubbleWrapMe : messageStyles.bubbleWrapThem,
          groupedWithNext && messageStyles.bubbleWrapGrouped,
        ]}
      >
        <View style={[messageStyles.offerCard, isMe && messageStyles.offerCardMe]}>
          <AppText variant="caption" color="textMuted">عرض سعر</AppText>
          <AppText variant="heading3" style={messageStyles.offerAmount}>
            {offer.amount.toLocaleString('en-US')} {offer.currencyLabel}
          </AppText>
          <AppText variant="micro" color="textSecondary" style={messageStyles.offerStatus}>
            {isMe ? 'تم إرسال العرض' : 'عرض وارد'}
          </AppText>
          {!isMe ? (
            <View style={messageStyles.offerActions}>
              <Pressable
                style={messageStyles.offerAccept}
                onPress={() => onRespondToOffer(true)}
              >
                <AppText variant="label" style={messageStyles.offerAcceptText}>قبول</AppText>
              </Pressable>
              <Pressable
                style={messageStyles.offerReject}
                onPress={() => onRespondToOffer(false)}
              >
                <AppText variant="label" color="textSecondary">رفض</AppText>
              </Pressable>
            </View>
          ) : null}
          <AppText variant="caption" style={[messageStyles.timeText, messageStyles.timeTextThem]}>
            {timeLabel}
            {isMe ? (
              <AppText variant="caption" style={{ color: item.read ? colors.electricBright : colors.textSubtle }}>
                {' '}✓✓
              </AppText>
            ) : null}
          </AppText>
        </View>
      </View>
    );
  }

  const parts = chatMessageParts(item);
  const uploading = item.status === 'uploading' || item.status === 'sending';
  const failed = item.status === 'failed';
  const mediaOnly = (parts.image || parts.video) && !parts.text && !parts.voice;
  // The tail corner sits on the last bubble of a sender group only.
  const tail = !groupedWithNext;
  const image = item.image;

  return (
    <View
      style={[
        messageStyles.bubbleWrap,
        isMe ? messageStyles.bubbleWrapMe : messageStyles.bubbleWrapThem,
        groupedWithNext && messageStyles.bubbleWrapGrouped,
      ]}
    >
      <View
        style={[
          messageStyles.bubble,
          isMe ? messageStyles.bubbleMe : messageStyles.bubbleThem,
          tail && (isMe ? messageStyles.bubbleMeTail : messageStyles.bubbleThemTail),
          mediaOnly && messageStyles.bubbleMedia,
        ]}
      >
        {parts.image && image ? (
          imageFailed ? (
            <View style={[messageStyles.bubbleImg, messageStyles.mediaFallback]}>
              <AppIcon name="alert-circle-outline" size={20} color={palette.receivedMeta} />
              <AppText variant="caption" style={{ color: palette.receivedMeta }}>
                تعذّر تحميل الصورة
              </AppText>
            </View>
          ) : (
            <Pressable
              onPress={() => onOpenImage(image)}
              accessibilityRole="imagebutton"
              accessibilityLabel="عرض الصورة بملء الشاشة"
              testID="chat-image"
            >
              <Image
                source={{ uri: image }}
                style={messageStyles.bubbleImg}
                contentFit="cover"
                onError={() => setImageFailed(true)}
              />
            </Pressable>
          )
        ) : null}
        {parts.video && item.video ? (
          <StoryVideoPlayer
            uri={item.video}
            style={messageStyles.bubbleVideo}
            muted={false}
            loop={false}
            autoPlay={false}
            nativeControls={!uploading}
          />
        ) : null}
        {parts.voice && item.audio ? (
          <VoiceMessageBubble
            uri={item.audio}
            durationMs={item.durationMs}
            isMe={isMe}
            palette={palette}
          />
        ) : null}
        {parts.text ? (
          <AppText variant="body" style={[messageStyles.bubbleText, isMe ? messageStyles.textMe : messageStyles.textThem]}>
            {item.text}
          </AppText>
        ) : null}
        {uploading && (parts.image || parts.video || parts.voice) ? (
          <View style={messageStyles.uploadRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={palette.sentAccent} />
            <AppText variant="caption" style={{ color: palette.sentMeta }}>
              {typeof item.progress === 'number'
                ? `جارٍ الرفع ${Math.round(item.progress * 100)}٪`
                : 'جارٍ الإرسال…'}
            </AppText>
          </View>
        ) : null}
        {failed ? (
          <Pressable
            onPress={() => onRetry(item.id)}
            style={messageStyles.retryRow}
            accessibilityRole="button"
            accessibilityLabel="إعادة المحاولة"
          >
            <AppIcon name="refresh" size={14} color={palette.danger} />
            <AppText variant="caption" style={{ color: palette.danger }} numberOfLines={2}>
              {item.error || 'فشل الإرسال'} · إعادة المحاولة
            </AppText>
          </Pressable>
        ) : null}
        <View style={[messageStyles.metaRow, mediaOnly && messageStyles.metaRowMedia]}>
          <AppText
            variant="micro"
            style={isMe ? messageStyles.timeTextMe : messageStyles.timeTextThem}
          >
            {timeLabel}
          </AppText>
          {isMe && !uploading && !failed ? (
            <AppIcon
              name="checkmark-done"
              size={14}
              color={item.read ? palette.sentTickRead : palette.sentMeta}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}, chatMessagePropsEqual);

type VoiceComposerProps = {
  status: 'idle' | 'starting' | 'recording' | 'stopping';
  durationMs: number;
  onStart: () => void;
  onCancel: () => void;
  onSend: () => void;
};

function ChatComposer({
  initialDraft,
  sending,
  attachOpen,
  onToggleAttach,
  onSend,
  onInputFocus,
  styles,
  colors,
  palette,
  composerTextStyle,
  bottomPad,
  voice,
}: {
  initialDraft?: string;
  sending: boolean;
  attachOpen: boolean;
  onToggleAttach: () => void;
  onSend: (text: string) => void;
  onInputFocus: () => void;
  styles: ChatScreenStyles;
  colors: ThemeColors;
  /** Send / mic colours: black in Light, white with black icon in Dark. */
  palette: ChatBubbleColors;
  composerTextStyle: object;
  bottomPad: number;
  voice: VoiceComposerProps;
}) {
  const [inputText, setInputText] = useState(initialDraft?.trim() ? initialDraft.trim() : '');

  useEffect(() => {
    if (typeof initialDraft === 'string' && initialDraft.trim()) {
      setInputText(initialDraft.trim());
    }
  }, [initialDraft]);

  const hasText = Boolean(inputText.trim());
  const canSend = hasText && !sending;
  const recording = voice.status === 'recording' || voice.status === 'stopping';

  if (recording) {
    return (
      <Row
        align="center"
        gap="sm"
        style={[styles.inputBar, styles.recordingBar, { paddingBottom: bottomPad }]}
      >
        <Pressable
          style={styles.attachBtn}
          onPress={voice.onCancel}
          disabled={voice.status === 'stopping'}
          accessibilityRole="button"
          accessibilityLabel="إلغاء التسجيل"
        >
          <AppIcon name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
        <View style={styles.recordingInfo} accessibilityLiveRegion="polite">
          <View style={[styles.recordingDot, { backgroundColor: colors.danger }]} />
          <AppText variant="label" color="textPrimary">
            {formatMediaDuration(voice.durationMs)}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.recordingHint}>
            جارٍ التسجيل…
          </AppText>
        </View>
        <Pressable
          style={[styles.sendBtn, voice.status === 'stopping' && styles.sendBtnDisabled]}
          onPress={voice.onSend}
          disabled={voice.status === 'stopping'}
          accessibilityRole="button"
          accessibilityLabel="إرسال الرسالة الصوتية"
        >
          {voice.status === 'stopping' ? (
            <ActivityIndicator size="small" color={palette.actionDisabledFg} />
          ) : (
            <AppIcon name="paper-plane" size={18} color={palette.actionFg} />
          )}
        </Pressable>
      </Row>
    );
  }

  return (
    <Row
      align="end"
      gap="sm"
      style={[
        styles.inputBar,
        { paddingBottom: bottomPad },
      ]}
    >
      <Pressable
        style={[styles.attachBtn, sending && { opacity: 0.4 }]}
        onPress={onToggleAttach}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel={attachOpen ? 'إغلاق المرفقات' : 'إضافة مرفق'}
        accessibilityState={{ disabled: sending }}
      >
        <AppIcon
          name={attachOpen ? 'close' : 'add'}
          size={22}
          color={colors.textPrimary}
        />
      </Pressable>

      <TextInput
        style={[styles.input, composerTextStyle, rtlInputText]}
        placeholder="اكتب رسالة..."
        placeholderTextColor={colors.textSubtle}
        value={inputText}
        onChangeText={setInputText}
        multiline
        maxLength={2000}
        onFocus={onInputFocus}
      />

      {hasText || sending ? (
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={() => {
            const text = inputText.trim();
            if (!text || sending) return;
            setInputText('');
            onSend(text);
          }}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="إرسال الرسالة"
          accessibilityState={{ disabled: !canSend, busy: sending }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={palette.actionDisabledFg} />
          ) : (
            <AppIcon
              name="paper-plane"
              size={18}
              color={canSend ? palette.actionFg : palette.actionDisabledFg}
            />
          )}
        </Pressable>
      ) : (
        <Pressable
          style={[
            styles.sendBtn,
            styles.sendBtnIdle,
            voice.status === 'starting' && styles.sendBtnDisabled,
          ]}
          onPress={voice.onStart}
          disabled={voice.status === 'starting'}
          accessibilityRole="button"
          accessibilityLabel="تسجيل رسالة صوتية"
          accessibilityState={{ busy: voice.status === 'starting' }}
          testID="chat-mic-button"
        >
          {voice.status === 'starting' ? (
            <ActivityIndicator size="small" color={palette.actionDisabledFg} />
          ) : (
            <AppIcon name="mic" size={18} color={palette.actionFg} />
          )}
        </Pressable>
      )}
    </Row>
  );
}

export default function ChatScreen() {
  const {
    threadId: threadIdParam,
    receiverId,
    receiverName,
    receiverAvatar,
    receiverVerified: receiverVerifiedParam,
    draftMessage: draftMessageParam,
  } = useLocalSearchParams<{
    threadId?: string;
    receiverId?: string;
    receiverName?: string;
    receiverAvatar?: string;
    /** '1' when the inbox / contact row already knows the peer is verified. */
    receiverVerified?: string;
    threadType?: string;
    accountType?: string;
    draftMessage?: string;
  }>();
  const router = useRouter();
  const { keyboardVisible, restingBottom } = useComposerKeyboardPad();
  const { colors, scheme } = useTheme();
  /** Light: white thread (unchanged). Dark: brand-black thread (#020202). */
  const palette = getChatBubbleColors(scheme);
  const styles = useThemedStyles(({ colors, scheme }) =>
    createStyles(colors, getChatBubbleColors(scheme)),
  );
  const messageStyles = useThemedStyles(({ colors, scheme }) =>
    createMessageStyles(colors, getChatBubbleColors(scheme)),
  );
  const composerTextStyle = resolveAppTextStyle({ variant: 'body', color: 'textPrimary' });
  const { me } = useAppUser();
  const { accessToken } = useAuth();
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  const hasToken = Boolean(accessToken);
  const MY_ID = me?.id || 'anonymous';
  const listRef = useRef<FlatList>(null);

  const isThreadMode = Boolean(threadIdParam && receiverId);
  /** User↔user DM — resolved by participant pair (never by listing). */
  const isDirectMode = Boolean(receiverId && !threadIdParam);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(threadIdParam ?? null);

  useEffect(() => {
    if (threadId) markInboxThreadRead(threadId);
  }, [threadId]);
  /** Existing verification data (route param, then profile / peer payload). */
  const [peerVerified, setPeerVerified] = useState(receiverVerifiedParam === '1');
  const [peerVerifiedTier, setPeerVerifiedTier] = useState<string | null>(null);
  const [peerUsername, setPeerUsername] = useState<string | null>(null);
  /** Existing block relation (users API `isBlocked`). */
  const [peerBlocked, setPeerBlocked] = useState(false);
  /** Server-side per-participant mute for this thread. */
  const [muted, setMuted] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Image opened in the existing full-screen Media Viewer. */
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<OutgoingMedia | null>(null);
  /** Failed / in-flight media jobs by optimistic id (retry without re-picking). */
  const mediaJobsRef = useRef(new Map<string, OutgoingMedia>());
  /** Jobs whose upload is running: their temp file must not be deleted yet. */
  const mediaInFlightRef = useRef(new Set<string>());
  const unmountedRef = useRef(false);
  const voiceResultRef = useRef<(res: VoiceStopResult) => void>(() => undefined);
  const voice = useVoiceRecorder({ onAutoStop: (res) => voiceResultRef.current(res) });

  /** Drop a media job and release its temp file (final success / failure). */
  const finalizeMediaJob = useCallback((id: string) => {
    const job = mediaJobsRef.current.get(id);
    mediaJobsRef.current.delete(id);
    job?.dispose?.();
  }, []);

  // Leaving the chat ends every pending retry: clean up idle jobs now; jobs
  // still uploading are finalized by runMediaJob once the upload settles.
  useEffect(() => {
    const jobs = mediaJobsRef.current;
    const inFlight = mediaInFlightRef.current;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      for (const [id, job] of [...jobs.entries()]) {
        if (inFlight.has(id)) continue;
        jobs.delete(id);
        job.dispose?.();
      }
    };
  }, []);

  const receiverUserId = receiverId;
  const activeChatType = 'DIRECT' as const;
  const headerName = receiverName || 'محادثة';
  const headerAvatar = receiverAvatar || undefined;

  useEffect(() => {
    if (!isThreadMode && !isDirectMode) {
      Alert.alert('خطأ', 'لم يتم تحديد المحادثة المطلوبة.');
      router.back();
    }
  }, [isThreadMode, isDirectMode, router]);

  // Peer verification + block state from the existing users API.
  useEffect(() => {
    if (!receiverId) return;
    let cancelled = false;
    fetchUserProfile(receiverId).then((profile) => {
      if (cancelled || !profile) return;
      setPeerVerified(Boolean(profile.verified));
      setPeerVerifiedTier(profile.verifiedTier ?? null);
      setPeerUsername(profile.username ?? null);
      setPeerBlocked(Boolean(profile.isBlocked));
    });
    return () => {
      cancelled = true;
    };
  }, [receiverId]);

  // Keyed on "has a token", not on the token string: the refresh that fires
  // when returning from the image picker must not re-run (and reset) the load.
  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    const loadMessages = async (id: string) => {
      const msgRes = await fetch(`${API_BASE}/api/messages/${id}`, {
        headers: { Authorization: `Bearer ${accessTokenRef.current ?? ''}` },
      });
      if (!msgRes.ok || cancelled) return;
      const msgJson = await msgRes.json();
      if (!cancelled && msgJson.success && msgJson.data?.messages) {
        const loaded: ChatMessage[] = msgJson.data.messages.map(mapApiMessage);
        // Merge, never replace: keeps uploading / just-sent bubbles (voice!).
        setMessages((prev) => reconcileLoadedMessages(prev, loaded));
        setMuted(msgJson.data.isMuted === true);
      }
    };

    if (isThreadMode && threadIdParam) {
      const loadThreadMessages = async () => {
        setLoadingMessages(true);
        try {
          setThreadId(threadIdParam);
          await loadMessages(threadIdParam);
        } catch (err) {
          console.warn('[ChatScreen] Failed to load thread messages:', err);
        } finally {
          if (!cancelled) setLoadingMessages(false);
        }
      };
      void loadThreadMessages();
      return () => {
        cancelled = true;
      };
    }

    if (isDirectMode && receiverId) {
      const loadDirectMessages = async () => {
        setLoadingMessages(true);
        try {
          // One conversation per pair: reuse it whatever the entry point.
          const peer = await fetchPeerConversation(receiverId);
          if (cancelled || !peer) return;
          if (peer.participant) {
            setPeerVerified(Boolean(peer.participant.verified));
            setPeerVerifiedTier(peer.participant.verifiedTier ?? null);
          }
          if (!peer.threadId) return;
          setMuted(peer.isMuted);
          setThreadId(peer.threadId);
          await loadMessages(peer.threadId);
        } catch (err) {
          console.warn('[ChatScreen] Failed to load direct messages:', err);
        } finally {
          if (!cancelled) setLoadingMessages(false);
        }
      };
      void loadDirectMessages();
    }
    return () => {
      cancelled = true;
    };
  }, [hasToken, isThreadMode, isDirectMode, receiverId, threadIdParam]);

  useChatThreadSocket(accessToken, threadId, (payload) => {
    if (!threadId) return;
    setMessages((prev) => applyChatSocketEvent(prev, payload, threadId));
    const parsed = parseChatSocketPayload(payload);
    if (!parsed) return;
    applyInboxThreadPreview({
      threadId,
      lastMessage: inboxPreviewText({
        text: parsed.message.text,
        image: parsed.message.image,
        video: parsed.message.video,
        audio: parsed.message.audio,
      }),
      lastMessageAt: parsed.message.createdAt,
      unread: 0,
      isMine: parsed.message.senderId === MY_ID,
      type: activeChatType,
      participant: receiverId
        ? {
            id: receiverId,
            displayName: receiverName || '',
            arabicName: receiverName || '',
            avatar: receiverAvatar || undefined,
            verified: peerVerified,
            verifiedTier: peerVerifiedTier,
          }
        : null,
    });
  });

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /**
   * POST a message. Text keeps the original behaviour (optimistic bubble,
   * removed + alert on failure). Media passes `optimisticId` so a failure
   * leaves a retryable bubble instead of losing the upload.
   */
  const deliverMessage = async (
    text: string,
    media?: SendMediaPayload,
    optimisticId?: string,
  ): Promise<boolean> => {
    const bodyText = text.trim();
    const hasMedia = Boolean(
      media && ('imageUrl' in media || 'videoUrl' in media || 'audioUrl' in media),
    );
    if ((!bodyText && !hasMedia) || !receiverUserId) {
      return false;
    }

    const tempId = optimisticId ?? `temp_${Date.now()}`;
    if (!optimisticId) {
      const optimisticMsg: ChatMessage = {
        id: tempId,
        senderId: MY_ID,
        receiverId: receiverUserId,
        text: bodyText || undefined,
        createdAt: new Date().toISOString(),
        read: false,
        kind: 'TEXT',
      };
      setMessages((prev) => [...prev, optimisticMsg]);
    } else {
      patchMessage(tempId, { status: 'sending', progress: undefined, error: undefined });
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          receiverId: receiverUserId,
          // Store in the conversation this screen shows (and reloads on return).
          ...(threadId ? { threadId } : {}),
          type: activeChatType,
          ...(bodyText ? { text: bodyText } : {}),
          ...(media ?? {}),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.message) {
          const real = mapApiMessage(json.data.message);
          setMessages((prev) =>
            mergeChatMessages(
              prev.filter((m) => m.id !== tempId),
              real,
            ),
          );
          // Follow the thread the server stored it in (socket room + reload).
          if (json.data.threadId && json.data.threadId !== threadId) setThreadId(json.data.threadId);
          const resolvedThreadId = json.data.threadId || threadId;
          if (resolvedThreadId) {
            applyInboxThreadPreview({
              threadId: resolvedThreadId,
              lastMessage: inboxPreviewText({
                text: real.text,
                image: real.image,
                video: real.video,
                audio: real.audio,
              }),
              lastMessageAt: new Date().toISOString(),
              unread: 0,
              isMine: true,
              type: activeChatType,
              participant: receiverId
                ? {
                    id: receiverId,
                    displayName: receiverName || '',
                    arabicName: receiverName || '',
                    avatar: receiverAvatar || undefined,
                    verified: peerVerified,
                    verifiedTier: peerVerifiedTier,
                  }
                : null,
            });
          }
          return true;
        }
        throw new Error('فشل إرسال الرسالة');
      } else {
        const json = await res.json().catch(() => ({}));
        const reason = json.messageAr || 'فشل إرسال الرسالة';
        throw FINAL_SEND_STATUSES.has(res.status) ? new FinalSendError(reason) : new Error(reason);
      }
    } catch (err) {
      console.warn('[ChatScreen] Failed to send message:', err);
      const reason = err instanceof Error ? err.message : 'فشل إرسال الرسالة، يرجى المحاولة مجدداً.';
      if (optimisticId) {
        patchMessage(tempId, { status: 'failed', error: reason });
        // Rejected by the server (e.g. size limit): retry cannot help.
        if (err instanceof FinalSendError) finalizeMediaJob(tempId);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert('خطأ', reason);
      }
      return false;
    }
  };

  const sendMessage = async (
    text: string,
  ) => {
    if (sending) return;
    setSending(true);
    try {
      await deliverMessage(text);
    } finally {
      setSending(false);
    }
  };
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  /** Upload (with progress / timeout) then send; never blocks the composer. */
  const runMediaJob = async (id: string, media: OutgoingMedia) => {
    if (!accessToken) return;
    try {
      await uploadAndDeliver(id, media, accessToken);
    } finally {
      mediaInFlightRef.current.delete(id);
      // Screen closed meanwhile: nobody can retry any more.
      if (unmountedRef.current) finalizeMediaJob(id);
    }
  };

  const uploadAndDeliver = async (id: string, media: OutgoingMedia, token: string) => {
    let url = media.uploadedUrl;
    if (url) {
      await deliverUploaded(id, media, url);
      return;
    }
    mediaInFlightRef.current.add(id);
    patchMessage(id, { status: 'uploading', progress: 0, error: undefined });
    let lastReported = 0;
    try {
      url = await uploadMediaFromUri(token, media.uri, 'messages', media.kind, {
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        timeoutMs: media.kind === 'video' ? 300_000 : 120_000,
        onProgress: (fraction) => {
          if (fraction - lastReported < 0.05 && fraction < 1) return;
          lastReported = fraction;
          patchMessage(id, { progress: fraction });
        },
      });
    } catch (err) {
      console.warn('[ChatScreen] Failed to upload media:', err);
      mediaInFlightRef.current.delete(id);
      patchMessage(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'فشل رفع الملف',
      });
      // Oversized files can never succeed; other failures keep the file for retry.
      if (err instanceof UploadError && err.code === 'too_large') finalizeMediaJob(id);
      return;
    }
    mediaInFlightRef.current.delete(id);
    media.uploadedUrl = url;
    if (media.kind === 'audio' && media.dispose) {
      // Upload complete: the temp recording is no longer needed (retries re-send the URL).
      media.dispose();
      patchMessage(id, { audio: url });
    }
    await deliverUploaded(id, media, url);
  };

  const deliverUploaded = async (id: string, media: OutgoingMedia, url: string) => {
    const ok = await deliverMessage('', mediaSendPayload(media, url), id);
    if (ok) finalizeMediaJob(id);
  };

  const sendMedia = (media: OutgoingMedia) => {
    if (!receiverUserId) return;
    try {
      assertUploadSize(media.kind, media.sizeBytes);
    } catch (err) {
      Alert.alert('الملف كبير', err instanceof Error ? err.message : 'حجم الملف أكبر من المسموح');
      media.dispose?.();
      return;
    }
    const id = `temp_${media.kind}_${Date.now()}`;
    const optimistic: ChatMessage = {
      id,
      senderId: MY_ID,
      receiverId: receiverUserId,
      image: media.kind === 'image' ? media.uri : undefined,
      video: media.kind === 'video' ? media.uri : undefined,
      audio: media.kind === 'audio' ? media.uri : undefined,
      durationMs: media.durationMs,
      kind: media.kind === 'audio' ? 'VOICE' : media.kind === 'video' ? 'VIDEO' : 'IMAGE',
      createdAt: new Date().toISOString(),
      read: false,
      status: 'uploading',
      progress: 0,
    };
    mediaJobsRef.current.set(id, media);
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    void runMediaJob(id, media);
  };
  const runMediaJobRef = useRef(runMediaJob);
  useEffect(() => {
    runMediaJobRef.current = runMediaJob;
  });

  const retryMessage = useCallback((id: string) => {
    const job = mediaJobsRef.current.get(id);
    if (job) void runMediaJobRef.current(id, job);
  }, []);

  const pickAndSendMedia = async (source: 'library' | 'camera' = 'library') => {
    if (!receiverUserId || !accessToken) return;
    setAttachOpen(false);

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('صلاحية مطلوبة', 'يجب السماح بالوصول للكاميرا.');
        return;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('صلاحية مطلوبة', 'يجب السماح بالوصول للصور والفيديو لإرسال الوسائط.');
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.85,
            videoMaxDuration: 60,
          });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const isVideo =
      asset.type === 'video' || (asset.mimeType?.startsWith('video/') ?? false);
    // Pre-send preview: nothing is uploaded until the user confirms.
    setPendingMedia({
      kind: isVideo ? 'video' : 'image',
      uri: asset.uri,
      mimeType: asset.mimeType ?? undefined,
      sizeBytes: asset.fileSize ?? undefined,
      durationMs: isVideo && asset.duration ? asset.duration : undefined,
    });
  };

  const confirmPendingMedia = () => {
    if (!pendingMedia) return;
    const media = pendingMedia;
    setPendingMedia(null);
    sendMedia(media);
  };

  const startVoice = async () => {
    setAttachOpen(false);
    const res = await voice.start();
    if (!res.ok) Alert.alert('الرسائل الصوتية', res.error);
  };

  const sendVoice = async () => {
    handleVoiceResult(await voice.stop());
  };

  const handleVoiceResult = (res: VoiceStopResult) => {
    if (!res.ok) {
      if (res.error) Alert.alert('الرسائل الصوتية', res.error);
      return;
    }
    const rec: VoiceRecording = res.recording;
    sendMedia({
      kind: 'audio',
      uri: rec.uri,
      mimeType: rec.mimeType,
      sizeBytes: rec.sizeBytes,
      durationMs: rec.durationMs,
      dispose: rec.dispose,
    });
  };
  useEffect(() => {
    voiceResultRef.current = handleVoiceResult;
  });

  const sendCurrentLocation = async () => {
    setAttachOpen(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('إذن الموقع', 'يرجى السماح بالوصول للموقع لمشاركته.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      await sendMessage(`📍 موقعي: https://maps.google.com/?q=${lat},${lng}`);
    } catch {
      Alert.alert('خطأ', 'تعذّر الحصول على الموقع.');
    }
  };

  const sendPriceOffer = () => {
    setAttachOpen(false);
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'إرسال عرض سعر',
        'أدخل المبلغ بالريال',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'إرسال',
            onPress: (value?: string) => {
              const amount = Number(String(value ?? '').replace(/[^\d.]/g, ''));
              if (!Number.isFinite(amount) || amount <= 0) {
                Alert.alert('تنبيه', 'أدخل مبلغاً صالحاً');
                return;
              }
              void sendMessage(formatOfferMessage(amount));
            },
          },
        ],
        'plain-text',
        '',
        'numeric',
      );
      return;
    }
    Alert.alert('إرسال عرض سعر', 'اختر مبلغاً سريعاً أو عدّل لاحقاً', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: '٢٬٠٠٠ ر.س',
        onPress: () => void sendMessage(formatOfferMessage(2000)),
      },
      {
        text: '٢٬٢٠٠ ر.س',
        onPress: () => void sendMessage(formatOfferMessage(2200)),
      },
      {
        text: '٢٬٥٠٠ ر.س',
        onPress: () => void sendMessage(formatOfferMessage(2500)),
      },
    ]);
  };

  const respondToOffer = useCallback((accept: boolean) => {
    void sendMessageRef.current(accept ? 'أوافق على العرض' : 'أرفض العرض');
  }, []);

  const openImage = useCallback((uri: string) => setViewerUri(uri), []);
  const viewerItems = useMemo(
    () => (viewerUri ? [{ uri: viewerUri, kind: 'image' as const }] : []),
    [viewerUri],
  );

  const rows = useMemo(() => buildChatRows(messages), [messages]);

  const renderRow = useCallback(
    ({ item }: { item: ChatRow }) =>
      item.type === 'day' ? (
        <View style={styles.datePillWrap} accessibilityRole="header">
          <AppText variant="micro" style={styles.datePill}>{item.label}</AppText>
        </View>
      ) : (
        <ChatMessageBubble
          item={item.message}
          myId={MY_ID}
          groupedWithPrev={item.groupedWithPrev}
          groupedWithNext={item.groupedWithNext}
          onRespondToOffer={respondToOffer}
          onRetry={retryMessage}
          onOpenImage={openImage}
          messageStyles={messageStyles}
          colors={colors}
          palette={palette}
        />
      ),
    [MY_ID, colors, messageStyles, openImage, palette, respondToOffer, retryMessage, styles],
  );

  /** «كتم المحادثة» — server-side, per participant (push only; messages still arrive). */
  const toggleMute = async () => {
    if (!threadId || muteBusy) return;
    const next = !muted;
    setMuteBusy(true);
    setMuted(next);
    const res = await setThreadMuted(threadId, next);
    if (unmountedRef.current) return;
    setMuteBusy(false);
    if (!res.ok) {
      setMuted(!next);
      void showToast('تعذّر تحديث كتم المحادثة', 'error');
      return;
    }
    setMuted(res.muted);
    setInboxThreadMuted(threadId, res.muted);
    void showToast(res.muted ? 'تم كتم المحادثة' : 'تم إلغاء كتم المحادثة', 'success');
  };

  /** «حظر الحساب» — existing users block API; old messages stay in the DB. */
  const toggleBlock = async () => {
    if (!receiverUserId) return;
    if (!accessToken) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لحظر الحساب');
      return;
    }
    const blocking = !peerBlocked;
    const confirmed = await confirmDestructive(
      blocking ? 'حظر الحساب' : 'إلغاء الحظر',
      blocking
        ? `لن ترى منشورات وإعلانات ${headerName}، ولا يمكنه التواصل معك. تبقى الرسائل السابقة محفوظة.`
        : `سيتمكن ${headerName} من مراسلتك مجدداً.`,
      blocking ? 'حظر' : 'إلغاء الحظر',
    );
    if (!confirmed) return;
    const result = await setBlockUser(receiverUserId, blocking);
    if (!result.ok) {
      await alertMessage(
        blocking ? 'تعذر حظر المستخدم' : 'تعذر إلغاء الحظر',
        result.message,
        'close-circle-outline',
      );
      return;
    }
    if (unmountedRef.current) return;
    setPeerBlocked(result.blocked);
    if (result.blocked) {
      void showToast('تم حظر الحساب', 'success');
      router.back();
      return;
    }
    void showToast('تم إلغاء الحظر', 'info');
  };

  return (
    <Screen edges={['top']} background="surface">
      <ComposerKeyboardView>
        {/* Header */}
        <Row style={styles.header} gap="sm">
          <SarhBackButton onPress={() => router.back()} color={colors.textPrimary} style={styles.backBtn} />
          <UserProfileLink userId={receiverUserId} style={styles.headerCenter}>
            <Image source={uriSource(headerAvatar)} style={styles.headerAvatar} contentFit="cover" />
            <View style={styles.headerText}>
              <View style={styles.headerNameRow}>
                <VerifiedInlineName name={headerName} verified={peerVerified} tier={peerVerifiedTier} username={peerUsername}>
                  <AppText variant="label" style={styles.headerName} numberOfLines={1}>{headerName}</AppText>
                </VerifiedInlineName>
                {muted ? (
                  <AppIcon name="notifications-off-outline" size={14} color={colors.textMuted} />
                ) : null}
              </View>
            </View>
          </UserProfileLink>
          <Pressable
            style={styles.moreBtn}
            hitSlop={8}
            onPress={() => setMoreOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="المزيد"
            testID="chat-more-button"
          >
            <AppIcon name="ellipsis-vertical" size={20} color={colors.textPrimary} />
          </Pressable>
        </Row>

        <View style={styles.threadPane}>
          <FlatList
            ref={listRef}
            style={styles.threadList}
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              messages.length === 0 && loadingMessages ? (
                <ActivityIndicator style={styles.threadLoading} color={palette.accent} />
              ) : null
            }
          />
        </View>

        {pendingMedia ? (
          <View style={styles.previewCard} accessibilityLabel="معاينة قبل الإرسال">
            {pendingMedia.kind === 'image' ? (
              <Image source={{ uri: pendingMedia.uri }} style={styles.previewThumb} contentFit="cover" />
            ) : (
              <StoryVideoPlayer
                uri={pendingMedia.uri}
                style={styles.previewThumb}
                muted
                loop={false}
                autoPlay={false}
                nativeControls
              />
            )}
            <View style={styles.previewMeta}>
              <AppText variant="label" color="textPrimary">
                {pendingMedia.kind === 'video' ? 'فيديو' : 'صورة'}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {[
                  pendingMedia.durationMs ? formatMediaDuration(pendingMedia.durationMs) : '',
                  formatFileSize(pendingMedia.sizeBytes),
                ]
                  .filter(Boolean)
                  .join(' · ') || 'جاهز للإرسال'}
              </AppText>
            </View>
            <Pressable
              style={styles.previewCancel}
              onPress={() => setPendingMedia(null)}
              accessibilityRole="button"
              accessibilityLabel="إلغاء المرفق"
            >
              <AppIcon name="close" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.sendBtn}
              onPress={confirmPendingMedia}
              accessibilityRole="button"
              accessibilityLabel="إرسال المرفق"
            >
              <AppIcon name="paper-plane" size={18} color={palette.actionFg} />
            </Pressable>
          </View>
        ) : null}

        {attachOpen ? (
          <View style={styles.attachSheet}>
            {(
              [
                { key: 'image', label: 'صورة', icon: 'image-outline', onPress: () => void pickAndSendMedia('library') },
                { key: 'camera', label: 'كاميرا', icon: 'camera-outline', onPress: () => void pickAndSendMedia('camera') },
                { key: 'location', label: 'موقع', icon: 'location-outline', onPress: () => void sendCurrentLocation() },
                { key: 'offer', label: 'إرسال عرض', icon: 'pricetag-outline', onPress: sendPriceOffer },
              ] as const
            ).map((action) => (
              <Pressable key={action.key} style={styles.attachAction} onPress={action.onPress}>
                <View style={styles.attachActionIcon}>
                  <AppIcon name={action.icon} size={20} color={colors.textPrimary} />
                </View>
                <AppText variant="micro" color="textSecondary" align="center">{action.label}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {peerBlocked ? (
          <View
            style={[
              styles.blockedBar,
              {
                paddingBottom: keyboardVisible
                  ? spacing.sm
                  : Math.max(restingBottom, spacing.sm) + spacing.sm,
              },
            ]}
            accessibilityLiveRegion="polite"
          >
            <AppIcon name="block" size={16} color={colors.textMuted} />
            <AppText variant="caption" color="textSecondary" style={styles.blockedText}>
              لقد حظرت هذا الحساب. الرسائل السابقة محفوظة.
            </AppText>
            <Pressable
              onPress={() => void toggleBlock()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="إلغاء الحظر"
            >
              <AppText variant="label" style={styles.blockedAction}>إلغاء الحظر</AppText>
            </Pressable>
          </View>
        ) : (
        <ChatComposer
          initialDraft={
            typeof draftMessageParam === 'string' ? draftMessageParam : undefined
          }
          sending={sending}
          attachOpen={attachOpen}
          onToggleAttach={() => setAttachOpen((v) => !v)}
          onSend={(text) => {
            void sendMessage(text);
          }}
          onInputFocus={() => setAttachOpen(false)}
          styles={styles}
          colors={colors}
          palette={palette}
          composerTextStyle={composerTextStyle}
          bottomPad={
            keyboardVisible
              ? spacing.sm
              : Math.max(restingBottom, spacing.sm) + spacing.sm
          }
          voice={{
            status: voice.status,
            durationMs: voice.durationMs,
            onStart: () => void startVoice(),
            onCancel: () => void voice.cancel(),
            onSend: () => void sendVoice(),
          }}
        />
        )}
      </ComposerKeyboardView>

      <ChatActionsSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        name={headerName}
        muted={muted}
        muteAvailable={Boolean(threadId)}
        muteBusy={muteBusy}
        onToggleMute={() => void toggleMute()}
        blocked={peerBlocked}
        onBlockToggle={() => void toggleBlock()}
        onViewProfile={
          receiverUserId
            ? () => router.push({ pathname: '/users/[id]', params: { id: receiverUserId } } as never)
            : undefined
        }
      />

      {/* Existing full-screen Media Viewer: black backdrop, contain (no crop), X to close. */}
      <MediaViewerModal
        visible={Boolean(viewerUri)}
        items={viewerItems}
        initialIndex={0}
        onClose={() => setViewerUri(null)}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors, palette: ChatBubbleColors) {
  return StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  headerName: { color: colors.textPrimary, flexShrink: 1 },
  moreBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  threadPane: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: palette.background,
  },
  threadLoading: { marginTop: spacing.xl },
  threadList: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messagesList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  // Quiet day separator (WhatsApp-style): small neutral pill, AA meta text.
  datePillWrap: { alignItems: 'center', marginVertical: spacing.sm },
  datePill: {
    backgroundColor: palette.receivedBg,
    color: palette.receivedMeta,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgSurface,
  },
  blockedText: { flex: 1 },
  blockedAction: { color: palette.accent },

  attachSheet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgPrimary,
  },
  attachAction: {
    width: '18%',
    alignItems: 'center',
    gap: 6,
  },
  attachActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgSurface,
  },
  attachBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    maxHeight: 100,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.actionBg,
  },
  sendBtnIdle: {
    backgroundColor: palette.actionBg,
  },
  /** Dark: low-contrast DS disabled fill. Light: identical to the action (unchanged). */
  sendBtnDisabled: {
    backgroundColor: palette.actionDisabledBg,
  },
  recordingBar: {
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 42,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5 },
  recordingHint: { flexShrink: 1 },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgSurface,
  },
  previewThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  previewMeta: { flex: 1, minWidth: 0, gap: 2 },
  previewCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}

function createMessageStyles(colors: ThemeColors, palette: ChatBubbleColors) {
  return StyleSheet.create({
  bubbleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
    gap: 8,
  },
  /** Next bubble is from the same sender: tight WhatsApp-style stacking. */
  bubbleWrapGrouped: { marginBottom: 2 },
  bubbleWrapMe: { justifyContent: 'flex-start' },
  bubbleWrapThem: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    minWidth: 72,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 5,
  },
  bubbleMe: {
    backgroundColor: palette.sentBg,
  },
  bubbleThem: {
    backgroundColor: palette.receivedBg,
  },
  // Sent bubbles sit at the inline start (right in Arabic); the "tail" corner
  // (last bubble of a group) uses logical start/end so RTL and LTR both point
  // at the outer edge.
  bubbleMeTail: {
    borderBottomStartRadius: 6,
  },
  bubbleThemTail: {
    borderBottomEndRadius: 6,
  },
  /** Image / video only: thin frame around the media, meta over the edge. */
  bubbleMedia: {
    paddingHorizontal: 3,
    paddingTop: 3,
    paddingBottom: 3,
  },
  bubbleText: { lineHeight: 22 },
  textMe: { color: palette.sentText },
  textThem: { color: palette.receivedText },
  mediaFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: palette.background,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bubbleImg: {
    width: 232, height: 174,
    borderRadius: 13,
  },
  bubbleVideo: {
    width: 220,
    height: 160,
    borderRadius: radius.md,
    marginBottom: 4,
    overflow: 'hidden',
  },
  timeText: { marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  metaRowMedia: { paddingHorizontal: 6, paddingTop: 3, paddingBottom: 1 },
  timeTextMe: { color: palette.sentMeta },
  timeTextThem: { color: palette.receivedMeta },
  offerCard: {
    maxWidth: '82%',
    borderRadius: 18,
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 4,
  },
  offerCardMe: {
    // Brand accent at 35% (black in Light, green in Dark).
    borderColor: `${colors.electric}59`,
  },
  offerAmount: {
    color: palette.offerAmount,
  },
  offerStatus: {
    marginBottom: 4,
  },
  offerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  offerAccept: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.actionBg,
  },
  offerAcceptText: { color: palette.actionFg },
  offerReject: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  });
}
