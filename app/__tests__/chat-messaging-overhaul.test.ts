import { readFileSync } from 'fs';
import path from 'path';
import {
  chatMessageParts,
  chatMessagePreview,
  formatMediaDuration,
  mapApiMessage,
  resolveChatMessageKind,
} from '@/lib/chatMessageModel';
import { applyChatSocketEvent, parseChatSocketPayload } from '@/lib/chatRealtime';
import { inboxPreviewText } from '@/hooks/useMessageThreads';
import { buildListingChatDraft, sellerChatParams } from '@/lib/listingChatDraft';
import { filterContactsLocally, mergeContacts, type ChatContact } from '@/services/chatApi';
import {
  VOICE_ERRORS,
  VOICE_MAX_DURATION_MS,
  VOICE_RECORDING_OPTIONS,
  baseMime,
  pickWebVoiceMime,
  voiceErrorMessage,
} from '@/lib/voiceRecording';
import {
  CHAT_UPLOAD_MAX_MB,
  UploadError,
  assertUploadSize,
  guessAudioMime,
} from '@/services/upload';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('chat message model (legacy + official kinds)', () => {
  it('maps legacy text / image / video rows without a type', () => {
    const text = mapApiMessage({
      id: '1',
      senderId: 'a',
      receiverId: 'b',
      text: 'مرحبا',
      createdAt: '2026-09-29T10:00:00.000Z',
      isRead: true,
    });
    expect(text).toMatchObject({ kind: 'TEXT', text: 'مرحبا', read: true });
    expect(text.audio).toBeUndefined();

    const image = mapApiMessage({
      id: '2',
      senderId: 'a',
      receiverId: 'b',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
      text: 'شوف الصورة',
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    expect(image.kind).toBe('IMAGE');
    expect(chatMessageParts(image)).toEqual({ image: true, video: false, voice: false, text: true });

    const video = mapApiMessage({
      id: '3',
      senderId: 'a',
      receiverId: 'b',
      videoUrl: 'https://cdn.example/v.mp4',
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    expect(video.kind).toBe('VIDEO');
    expect(chatMessageParts(video).video).toBe(true);
  });

  it('maps an official VOICE message with duration', () => {
    const voice = mapApiMessage({
      id: '4',
      senderId: 'a',
      receiverId: 'b',
      type: 'VOICE',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/v.m4a',
      mediaDurationMs: 7300,
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    expect(voice).toMatchObject({ kind: 'VOICE', durationMs: 7300 });
    expect(chatMessageParts(voice)).toEqual({ image: false, video: false, voice: true, text: false });
    expect(formatMediaDuration(voice.durationMs)).toBe('0:07');
    expect(formatMediaDuration(65_000)).toBe('1:05');
  });

  it('infers the kind from media even if an unknown type arrives', () => {
    expect(resolveChatMessageKind({ type: 'STICKER', image: 'x' })).toBe('IMAGE');
    expect(resolveChatMessageKind({ type: 'VOICE' })).toBe('VOICE');
    expect(resolveChatMessageKind({})).toBe('TEXT');
  });

  it('builds previews for every kind', () => {
    expect(chatMessagePreview({ audio: 'x' })).toBe('[رسالة صوتية]');
    expect(inboxPreviewText({ audio: 'x' })).toBe('[رسالة صوتية]');
    expect(inboxPreviewText({ video: 'x' })).toBe('[فيديو]');
    expect(inboxPreviewText({ image: 'x' })).toBe('[صورة]');
    expect(inboxPreviewText({ text: ' hi ' })).toBe('hi');
  });
});

describe('chat socket events', () => {
  it('parses chat:message voice payloads and merges them into the thread', () => {
    const payload = {
      id: 'm-voice',
      threadId: 't1',
      senderId: 'peer',
      receiverId: 'me',
      type: 'VOICE',
      audioUrl: 'https://cdn.example/v.webm',
      mediaDurationMs: 2500,
      createdAt: '2026-09-29T10:00:00.000Z',
    };
    const parsed = parseChatSocketPayload(payload);
    expect(parsed?.message).toMatchObject({
      kind: 'VOICE',
      audio: 'https://cdn.example/v.webm',
      durationMs: 2500,
    });
    const next = applyChatSocketEvent([], payload, 't1');
    expect(next).toHaveLength(1);
    expect(applyChatSocketEvent([], payload, 'other-thread')).toHaveLength(0);
  });

  it('still parses legacy image payloads', () => {
    const parsed = parseChatSocketPayload({
      message: {
        id: 'm1',
        senderId: 'a',
        receiverId: 'b',
        imageUrl: 'https://cdn.example/a.jpg',
      },
    });
    expect(parsed?.message.kind).toBe('IMAGE');
    expect(parsed?.message.image).toBe('https://cdn.example/a.jpg');
  });
});

describe('message the seller from a listing', () => {
  const listing = { id: 'lst-1', title: 'Najdi sheep', arabicTitle: 'خروف نجدي' };
  const seller = { id: 'seller-1', arabicName: 'أبو محمد', avatar: null };

  it('pre-fills an editable draft with the listing title and link', () => {
    const draft = buildListingChatDraft(listing);
    expect(draft).toContain('خروف نجدي');
    expect(draft).toContain('/l/lst-1');
  });

  it('opens the general 1:1 with the owner without binding the listing', () => {
    const params = sellerChatParams({ listing, seller });
    expect(params).toEqual({
      receiverId: 'seller-1',
      receiverName: 'أبو محمد',
      receiverAvatar: '',
      draftMessage: buildListingChatDraft(listing),
    });
    expect(Object.keys(params).some((k) => k.startsWith('listing'))).toBe(false);
    expect(params.threadId).toBeUndefined();
  });

  it('keeps a caller supplied draft', () => {
    expect(sellerChatParams({ listing, seller, draftMessage: ' كم السعر؟ ' }).draftMessage).toBe(
      'كم السعر؟',
    );
  });

  it('listing screen routes to /chat through sellerChatParams only', () => {
    const screen = src('app/listing/[id].tsx');
    const fn = screen.slice(
      screen.indexOf('const openSellerChat'),
      screen.indexOf('const openSellerCall'),
    );
    expect(fn).toContain('sellerChatParams(');
    expect(fn).not.toContain('listingId:');
    expect(fn).not.toContain('saveMessageListingContext');
    expect(fn).not.toContain("accountType: 'LIVESTOCK_TRADER'");
  });
});

describe('chat screen wiring', () => {
  const chat = src('app/chat.tsx');

  it('resolves the conversation by participant pair, not the top-50 inbox or a listing', () => {
    expect(chat).toContain('fetchPeerConversation(receiverId)');
    expect(chat).not.toContain('/api/messages?type=DIRECT');
    expect(chat).not.toContain('messageListingContext');
    expect(chat).not.toContain('listingId');
  });

  it('has a scheme-aware thread background (white Light, black Dark) and no online-status line', () => {
    expect(chat).toContain('backgroundColor: palette.background');
    expect(chat).toContain('getChatBubbleColors(scheme)');
    expect(chat).not.toContain('متصل الآن');
    expect(chat).not.toContain('onlineDot');
    expect(chat).not.toContain('LinearGradient');
  });

  it('renders voice notes and offers a mic when the composer is empty', () => {
    expect(chat).toContain('<VoiceMessageBubble');
    expect(chat).toContain('chat-mic-button');
    expect(chat).toContain('تسجيل رسالة صوتية');
    expect(chat).toContain('إلغاء التسجيل');
    expect(chat).toContain("messageType: 'VOICE' as const");
  });

  it('has pre-send preview, upload progress and retry for media', () => {
    expect(chat).toContain('معاينة قبل الإرسال');
    expect(chat).toContain('onProgress');
    expect(chat).toContain('إعادة المحاولة');
    expect(chat).toContain('assertUploadSize(media.kind, media.sizeBytes)');
  });
});

describe('new message entry point', () => {
  it('messages panel exposes a new-message button and bottom sheet', () => {
    const panel = src('components/feature/MessagesPanel.tsx');
    expect(panel).toContain('رسالة جديدة');
    expect(panel).toContain('<NewMessageSheet');
    expect(panel).not.toContain('messageListingContext');
  });

  it('sheet uses RN Animated + Modal and the contacts API (no new libraries)', () => {
    const sheet = src('components/feature/NewMessageSheet.tsx');
    expect(sheet).toContain('Animated.timing');
    expect(sheet).toContain('<Modal');
    expect(sheet).toContain('fetchMessageContacts');
    expect(sheet).not.toContain('react-native-reanimated');
    expect(sheet).not.toContain('gesture-handler');
  });

  const contacts: ChatContact[] = [
    { id: '1', displayName: 'Ahmed', arabicName: 'أحمد', username: 'ahmed', verified: false, source: 'recent' },
    { id: '2', displayName: 'Sara', arabicName: 'سارة', username: 'sara_k', verified: true, source: 'following' },
  ];

  it('filters contacts locally by Arabic name, display name or username', () => {
    expect(filterContactsLocally(contacts, 'أحم').map((c) => c.id)).toEqual(['1']);
    expect(filterContactsLocally(contacts, 'SARA').map((c) => c.id)).toEqual(['2']);
    expect(filterContactsLocally(contacts, '')).toHaveLength(2);
  });

  it('merges remote search results without duplicates', () => {
    const merged = mergeContacts(contacts, [
      { ...contacts[0] },
      { id: '3', displayName: 'Omar', arabicName: 'عمر', verified: false, source: 'search' },
    ]);
    expect(merged.map((c) => c.id)).toEqual(['1', '2', '3']);
  });
});

describe('voice recording configuration', () => {
  it('records mono AAC m4a at ~64kbps on native and webm on web', () => {
    expect(VOICE_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    expect(VOICE_RECORDING_OPTIONS.bitRate).toBe(64_000);
    expect(VOICE_RECORDING_OPTIONS.extension).toBe('.m4a');
    expect(VOICE_RECORDING_OPTIONS.android).toMatchObject({ outputFormat: 'mpeg4', audioEncoder: 'aac' });
    expect(VOICE_RECORDING_OPTIONS.web.mimeType).toBe('audio/webm');
    expect(VOICE_MAX_DURATION_MS).toBe(300_000);
  });

  it('prefers webm/opus with MediaRecorder and falls back to mp4', () => {
    expect(pickWebVoiceMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickWebVoiceMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickWebVoiceMime(undefined)).toBeUndefined();
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('maps permission and device failures to Arabic messages', () => {
    expect(voiceErrorMessage({ name: 'NotAllowedError' })).toBe(VOICE_ERRORS.permissionDenied);
    expect(voiceErrorMessage({ name: 'NotFoundError' })).toBe(VOICE_ERRORS.noMicrophone);
    expect(voiceErrorMessage({ name: 'NotReadableError' })).toBe(VOICE_ERRORS.busy);
    expect(voiceErrorMessage(new Error('boom'))).toBe(VOICE_ERRORS.failed);
  });

  it('uses expo-audio (installed) — not expo-av — and no Reanimated in the chat', () => {
    const pkg = JSON.parse(src('package.json'));
    expect(pkg.dependencies['expo-audio']).toBeDefined();
    expect(pkg.dependencies['expo-av']).toBeUndefined();
    const hook = src('hooks/useVoiceRecorder.ts');
    expect(hook).toContain("from 'expo-audio'");
    expect(hook).toContain('MediaRecorder');
    expect(src('app/chat.tsx')).not.toContain('react-native-reanimated');
  });
});

describe('media upload limits', () => {
  it('guesses audio mimes and enforces per-kind client limits', () => {
    expect(guessAudioMime('file:///rec/abc.m4a')).toBe('audio/mp4');
    expect(guessAudioMime('blob:x/y.webm')).toBe('audio/webm');
    expect(CHAT_UPLOAD_MAX_MB).toEqual({ image: 20, video: 50, audio: 10 });
    expect(() => assertUploadSize('audio', 11 * 1024 * 1024)).toThrow(UploadError);
    expect(() => assertUploadSize('video', 49 * 1024 * 1024)).not.toThrow();
    expect(() => assertUploadSize('image', undefined)).not.toThrow();
  });
});
