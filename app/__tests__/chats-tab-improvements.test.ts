/**
 * Chats tab improvements (Sep 30): header «رسالة جديدة», no quick replies,
 * white list, compact search, no online dot, verified badge, «المزيد» sheet
 * (server-side mute + existing block), WhatsApp-style thread rows, image →
 * existing Media Viewer, and the voice-disappears-after-image state bug.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type { ChatMessage } from '@/services/chatMessages';
import {
  applyChatSocketEvent,
  mergeChatMessages,
  reconcileLoadedMessages,
} from '@/lib/chatRealtime';
import { buildChatRows, chatDayKey, chatDayLabel, CHAT_GROUP_WINDOW_MS } from '@/lib/chatThreadLayout';
import { chatMessageParts, mapApiMessage } from '@/lib/chatMessageModel';
import { chatBubbleColors, contrastRatio } from '@/lib/chatBubbleTheme';
import { snapshotTheme } from '@/constants/theme';
import { fetchPeerConversation, setThreadMuted } from '@/services/chatApi';

jest.mock('@/services/authFetch', () => ({
  authFetch: (input: string, init?: RequestInit) => global.fetch(input, init as RequestInit),
}));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const ME = 'me';
const PEER = 'peer';

function msg(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    senderId: ME,
    receiverId: PEER,
    createdAt: '2026-09-30T06:00:00.000Z',
    read: false,
    kind: 'TEXT',
    ...extra,
  };
}

describe('voice message does not disappear after sending an image (state bug)', () => {
  it('a reload snapshot never drops a just-delivered voice note or uploading media', () => {
    const old = msg('m-old', { text: 'قديمة', createdAt: '2026-09-29T10:00:00.000Z' });
    // Voice delivered by the POST response after the GET snapshot was taken.
    const voice = msg('m-voice', {
      audio: 'https://res.cloudinary.com/x/video/authenticated/s--sig--/v1/v.m4a',
      durationMs: 4000,
      kind: 'VOICE',
      createdAt: '2026-09-30T06:01:00.000Z',
    });
    // Image still uploading (optimistic bubble).
    const imageTemp = msg('temp_image_1', {
      image: 'file:///pick/photo.jpg',
      kind: 'IMAGE',
      status: 'uploading',
      progress: 0.4,
      createdAt: '2026-09-30T06:01:30.000Z',
    });
    const prev = [old, voice, imageTemp];
    // Returning from the picker refreshed the token → the thread GET re-ran and
    // resolved with a snapshot that predates the voice note.
    const snapshot = [old];
    const next = reconcileLoadedMessages(prev, snapshot);
    expect(next.map((m) => m.id)).toEqual(['m-old', 'm-voice', 'temp_image_1']);
    expect(next.find((m) => m.id === 'm-voice')?.audio).toBe(voice.audio);
  });

  it('keeps a failed voice bubble (retry) and dedupes messages the server returned', () => {
    const failedVoice = msg('temp_audio_1', {
      audio: 'blob:x',
      kind: 'VOICE',
      status: 'failed',
      error: 'x',
    });
    const real = msg('m1', { text: 'hi' });
    const next = reconcileLoadedMessages([real, failedVoice], [real]);
    expect(next.map((m) => m.id)).toEqual(['m1', 'temp_audio_1']);
    expect(reconcileLoadedMessages([], [real])).toEqual([real]);
  });

  it('full send sequence: text → voice → image keeps every bubble (socket + POST races)', () => {
    let list: ChatMessage[] = [];
    // text
    list = [...list, msg('temp_1', { text: 'مرحبا' })];
    list = mergeChatMessages(list.filter((m) => m.id !== 'temp_1'), msg('t1', { text: 'مرحبا' }));
    // voice: optimistic → uploaded url patched → POST response
    list = [...list, msg('temp_audio_2', { audio: 'blob:voice', kind: 'VOICE', status: 'uploading' })];
    list = list.map((m) => (m.id === 'temp_audio_2' ? { ...m, audio: 'https://cdn/raw.m4a' } : m));
    const realVoice = msg('v1', {
      audio: 'https://cdn/signed.m4a',
      kind: 'VOICE',
      durationMs: 3000,
      createdAt: '2026-09-30T06:02:00.000Z',
    });
    list = mergeChatMessages(list.filter((m) => m.id !== 'temp_audio_2'), realVoice);
    // image: optimistic, then the socket echo arrives BEFORE the POST response
    list = [...list, msg('temp_image_3', { image: 'file:///p.jpg', kind: 'IMAGE', status: 'uploading' })];
    const realImage = {
      id: 'i1',
      senderId: ME,
      receiverId: PEER,
      threadId: 'th',
      imageUrl: 'https://cdn/signed.jpg',
      type: 'IMAGE',
      createdAt: '2026-09-30T06:03:00.000Z',
    };
    list = applyChatSocketEvent(list, { message: realImage }, 'th');
    list = mergeChatMessages(
      list.filter((m) => m.id !== 'temp_image_3'),
      mapApiMessage(realImage as never),
    );
    expect(list.map((m) => m.id)).toEqual(['t1', 'v1', 'i1']);
    expect(chatMessageParts(list[1]).voice).toBe(true);
    expect(chatMessageParts(list[2]).image).toBe(true);
    // A late reload (token refresh) still keeps all three.
    expect(reconcileLoadedMessages(list, [list[0]]).map((m) => m.id)).toEqual(['t1', 'v1', 'i1']);
  });

  it('chat.tsx merges reloads and no longer re-runs the load on token rotation', () => {
    const chat = src('app/chat.tsx');
    expect(chat).toContain('setMessages((prev) => reconcileLoadedMessages(prev, loaded))');
    expect(chat).not.toContain('setMessages(msgJson.data.messages.map(mapApiMessage))');
    expect(chat).toContain('}, [hasToken, isThreadMode, isDirectMode, receiverId, threadIdParam]);');
    expect(chat).toContain('accessTokenRef.current');
  });
});

describe('old messages still render', () => {
  it('maps legacy text / image / video / voice rows to their bubble parts', () => {
    const base = { senderId: PEER, receiverId: ME, createdAt: '2026-01-01T00:00:00.000Z' };
    const legacyImage = mapApiMessage({ ...base, id: 'a', imageUrl: 'https://x/a.jpg', text: 'صورة' } as never);
    const legacyVideo = mapApiMessage({ ...base, id: 'b', videoUrl: 'https://x/b.mp4' } as never);
    const voice = mapApiMessage({ ...base, id: 'c', type: 'VOICE', audioUrl: 'https://x/c.m4a', mediaDurationMs: 2000 } as never);
    const text = mapApiMessage({ ...base, id: 'd', text: 'نص' } as never);
    expect(chatMessageParts(legacyImage)).toMatchObject({ image: true, text: true });
    expect(chatMessageParts(legacyVideo)).toMatchObject({ video: true });
    expect(chatMessageParts(voice)).toMatchObject({ voice: true });
    expect(voice.durationMs).toBe(2000);
    expect(chatMessageParts(text)).toMatchObject({ text: true, image: false });
  });
});

describe('thread rows: quiet day separators + sender grouping', () => {
  const now = new Date(2026, 8, 30, 12, 0, 0);
  const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString();

  it('labels today / yesterday and inserts one separator per day', () => {
    expect(chatDayLabel(at(30, 9), now)).toBe('اليوم');
    expect(chatDayLabel(at(29, 9), now)).toBe('أمس');
    expect(chatDayLabel(at(10, 9), now)).not.toBe('');
    expect(chatDayKey(at(10, 9))).toBe('2026-09-10');
    const rows = buildChatRows(
      [
        msg('a', { createdAt: at(29, 9) }),
        msg('b', { createdAt: at(30, 9) }),
        msg('c', { createdAt: at(30, 9, 1) }),
      ],
      now,
    );
    expect(rows.map((r) => (r.type === 'day' ? `day:${r.label}` : r.key))).toEqual([
      'day:أمس',
      'a',
      'day:اليوم',
      'b',
      'c',
    ]);
  });

  it('groups consecutive bubbles of one sender within the window only', () => {
    const rows = buildChatRows(
      [
        msg('a', { createdAt: at(30, 9, 0) }),
        msg('b', { createdAt: at(30, 9, 2) }),
        msg('c', { createdAt: at(30, 9, 3), senderId: PEER }),
        msg('d', { createdAt: new Date(new Date(at(30, 9, 3)).getTime() + CHAT_GROUP_WINDOW_MS + 60_000).toISOString(), senderId: PEER }),
      ],
      now,
    ).filter((r) => r.type === 'message');
    expect(rows.map((r) => r.type === 'message' && [r.groupedWithPrev, r.groupedWithNext])).toEqual([
      [false, true],
      [true, false],
      [false, false],
      [false, false],
    ]);
  });
});

describe('Chats list screen', () => {
  const tab = src('app/(tabs)/messages.tsx');
  const panel = src('components/feature/MessagesPanel.tsx');
  const appBar = src('components/ui/HomeAppBar.tsx');

  it('header: bell replaced by a «رسالة جديدة» button that opens the existing NewMessageSheet', () => {
    expect(appBar).toContain('trailing?: ReactNode');
    expect(appBar).toContain('{trailing ? (');
    expect(tab).toContain('trailing={');
    expect(tab).toContain('accessibilityLabel="رسالة جديدة"');
    expect(tab).toContain('name="square-pen"');
    expect(tab).toContain('newMessageOpen={newMessageOpen}');
    expect(tab).toContain('onNewMessageOpenChange={setNewMessageOpen}');
    expect(tab).not.toContain('NotificationBellButton');
    expect(panel).toContain('<NewMessageSheet');
    expect(panel).toContain('visible={newMessageOpen}');
    const icons = src('lib/lucideIconMap.ts');
    expect(icons).toContain("'square-pen': SquarePen,");
    expect(icons).toContain("'notifications-off-outline': BellOff,");
  });

  it('removes the duplicate floating «رسالة جديدة» button', () => {
    expect(panel).not.toContain('newMessageDock');
    expect(panel).not.toContain('shape="pill"\n            onPress={() => setNewMessageOpen(true)}');
  });

  it('list background is exactly #FFFFFF (light) with calm hairline rows and no shadows', () => {
    expect(snapshotTheme('light').colors.screenRoot).toBe('#FFFFFF');
    expect(panel).toContain('root: { flex: 1, backgroundColor: colors.screenRoot }');
    expect(panel).toContain('list: { flex: 1, backgroundColor: colors.screenRoot }');
    // chatRow ends with screenRoot (CRLF-safe); still white screenRoot, no bgDeep / shadows.
    expect(panel).toMatch(/chatRow:\s*\{[\s\S]*?backgroundColor: colors\.screenRoot,/);
    expect(panel).not.toContain('colors.bgDeep');
    expect(panel).not.toMatch(/shadow(Opacity|Radius|Color)|elevation:/);
  });

  it('header search is the compact (40pt) SarhInput with the same behaviour', () => {
    expect(tab).toContain('size="compact"');
    expect(tab).toContain('const SEARCH_H = space[40]');
    expect(tab).toContain('trailingIcon="search"');
    expect(tab).toContain('onChangeText={setSearch}');
    expect(tab).toContain('accessibilityRole="search"');
  });

  it('no green online dot on list avatars', () => {
    expect(panel).not.toContain('onlineDot');
    expect(panel).not.toContain('colors.emerald,\n      borderWidth: 2');
  });

  it('verified badge uses the existing VerifiedInlineName everywhere names show in chats', () => {
    expect(panel).toContain('<VerifiedInlineName name={title} verified={p.verified}');
    expect(src('components/feature/NewMessageSheet.tsx')).toContain('<VerifiedInlineName');
    expect(src('app/chat.tsx')).toContain('<VerifiedInlineName name={headerName} verified={peerVerified} tier={peerVerifiedTier} username={peerUsername}>');
    for (const f of ['components/feature/MessagesPanel.tsx', 'components/feature/NewMessageSheet.tsx']) {
      expect(src(f)).not.toContain('checkmark-circle');
    }
    expect(panel).toContain("receiverVerified: p.verified ? '1' : '0'");
    expect(panel).toContain("receiverVerified: contact.verified ? '1' : '0'");
  });
});

describe('quick replies removed', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.') || name === '__tests__') continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
    }
    return out;
  }

  it('no canned replies remain in the chat or anywhere in app code', () => {
    const chat = src('app/chat.tsx');
    expect(chat).not.toMatch(/QUICK_REPLIES|quickRepl/i);
    const files = ['app', 'components', 'lib', 'hooks'].flatMap((d) => walk(path.join(root, d)));
    const hits = files.filter((f) => /هل الحيوان ما ?زال متاح/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('keeps the core composer functions', () => {
    const chat = src('app/chat.tsx');
    for (const token of ['pickAndSendMedia', 'sendCurrentLocation', 'sendPriceOffer', 'chat-mic-button', 'معاينة قبل الإرسال']) {
      expect(chat).toContain(token);
    }
  });
});

describe('chat header «المزيد» sheet', () => {
  const chat = src('app/chat.tsx');
  const sheet = src('components/feature/chat/ChatActionsSheet.tsx');

  it('the more button opens a RN Animated sheet with mute toggle + block', () => {
    expect(chat).toContain('onPress={() => setMoreOpen(true)}');
    expect(chat).toContain('accessibilityLabel="المزيد"');
    expect(chat).toContain('<ChatActionsSheet');
    expect(sheet).toContain('Animated.timing');
    expect(sheet).toContain('<Modal');
    expect(sheet).toContain('<Switch');
    expect(sheet).toContain('كتم المحادثة');
    expect(sheet).toContain('حظر الحساب');
    expect(sheet).not.toContain('react-native-reanimated');
    expect(sheet).not.toContain('LinearGradient');
  });

  it('mute is server-side (PATCH /messages/:id/mute), not local-only', () => {
    expect(chat).toContain('await setThreadMuted(threadId, next)');
    expect(chat).toContain('setInboxThreadMuted(threadId, res.muted)');
    expect(chat).toContain('setMuted(msgJson.data.isMuted === true)');
    expect(chat).not.toContain('AsyncStorage');
  });

  it('block reuses the existing users API, confirms first, keeps messages', () => {
    expect(chat).toContain('await setBlockUser(receiverUserId, blocking)');
    const confirmAt = chat.indexOf('await confirmDestructive(');
    const blockAt = chat.indexOf('await setBlockUser(receiverUserId, blocking)');
    expect(confirmAt).toBeGreaterThan(-1);
    expect(blockAt).toBeGreaterThan(confirmAt);
    expect(chat).toContain('تبقى الرسائل السابقة محفوظة');
    expect(chat).not.toMatch(/method:\s*'DELETE'/);
  });
});

describe('setThreadMuted / peer isMuted (REST helpers)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('PATCHes the mute endpoint and returns the server state', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { muted: true, mutedAt: 'x' } }),
    });
    global.fetch = fetchMock as never;
    await expect(setThreadMuted('th-1', true)).resolves.toEqual({ ok: true, muted: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/messages\/th-1\/mute$/);
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ muted: true }) });
  });

  it('reports failure (caller reverts the toggle)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never;
    await expect(setThreadMuted('th-1', false)).resolves.toEqual({ ok: false });
    await expect(setThreadMuted('', true)).resolves.toEqual({ ok: false });
  });

  it('peer lookup exposes isMuted and the verified participant', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { threadId: 't', isMuted: true, participant: { id: 'p', verified: true } },
      }),
    }) as never;
    await expect(fetchPeerConversation('p')).resolves.toMatchObject({
      threadId: 't',
      isMuted: true,
      participant: { verified: true },
    });
  });
});

describe('inner chat design + images', () => {
  const chat = src('app/chat.tsx');

  it('image tap opens the EXISTING full-screen Media Viewer (black, contain, X)', () => {
    expect(chat).toContain('onPress={() => onOpenImage(image)}');
    expect(chat).toContain('<MediaViewerModal');
    expect(chat).toContain("[{ uri: viewerUri, kind: 'image' as const }]");
    const viewer = src('components/ui/ImageViewerModal.tsx');
    expect(viewer).toContain("backgroundColor: '#000'");
    expect(viewer).toContain('resizeMode="contain"');
    expect(viewer).toContain('accessibilityLabel="إغلاق"');
    // Images-only without overlay routes to the zoomable image viewer.
    expect(src('components/ui/MediaViewerModal.tsx')).toContain('if (imagesOnly && !overlay)');
  });

  it('quiet day separators, grouped bubbles and tick icons with AA contrast', () => {
    expect(chat).toContain('buildChatRows(messages)');
    expect(chat).toContain("item.type === 'day'");
    expect(chat).toContain('bubbleWrapGrouped');
    expect(chat).toContain('name="checkmark-done"');
    // Only the offer card keeps its text ticks; message bubbles use the icon.
    expect((chat.match(/✓✓/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(contrastRatio(chatBubbleColors.receivedMeta, chatBubbleColors.receivedBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chatBubbleColors.sentMeta, chatBubbleColors.sentBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chatBubbleColors.sentText, chatBubbleColors.sentBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chatBubbleColors.receivedText, chatBubbleColors.receivedBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(chatBubbleColors.accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('leave → return: media sent in a chat is stored in the thread that is reloaded', () => {
  const chat = src('app/chat.tsx');

  it('sends the open threadId and follows the stored thread', () => {
    expect(chat).toContain('...(threadId ? { threadId } : {}),');
    expect(chat).toContain('if (json.data.threadId && json.data.threadId !== threadId) setThreadId(json.data.threadId);');
  });

  it('a REST reload of the thread renders voice, image and legacy media again', () => {
    // Shape returned by GET /messages/:threadId after the fix (see backend
    // messages.reopen-media.spec.ts): signed protected URLs + legacy URLs.
    const payload = [
      { id: 'old-img', senderId: PEER, receiverId: ME, text: 'صورة قديمة', imageUrl: 'https://res.cloudinary.com/sarh/image/upload/v16/old.jpg', type: 'IMAGE', createdAt: '2026-01-01T00:00:00.000Z', isRead: true },
      { id: 'old-vid', senderId: PEER, receiverId: ME, videoUrl: 'https://res.cloudinary.com/sarh/video/upload/v16/old.mp4', type: 'VIDEO', createdAt: '2026-01-01T00:01:00.000Z', isRead: true },
      { id: 'm1', senderId: ME, receiverId: PEER, audioUrl: 'https://res.cloudinary.com/sarh/video/authenticated/s--SIGNED1--/v17/safat/messages/me/voice1.m4a', mediaDurationMs: 4200, type: 'VOICE', createdAt: '2026-09-30T06:01:00.000Z', isRead: false },
      { id: 'm2', senderId: ME, receiverId: PEER, imageUrl: 'https://res.cloudinary.com/sarh/image/authenticated/s--SIGNED1--/v17/safat/messages/me/photo1.jpg', type: 'IMAGE', createdAt: '2026-09-30T06:02:00.000Z', isRead: false },
    ];
    // Fresh mount after returning: prev is empty.
    const shown = reconcileLoadedMessages([], payload.map((m) => mapApiMessage(m as never)));
    expect(shown.map((m) => m.kind)).toEqual(['IMAGE', 'VIDEO', 'VOICE', 'IMAGE']);
    expect(chatMessageParts(shown[2])).toMatchObject({ voice: true });
    expect(shown[2].durationMs).toBe(4200);
    expect(shown[2].audio).toContain('s--SIGNED1--');
    expect(chatMessageParts(shown[3])).toMatchObject({ image: true });
    expect(chatMessageParts(shown[0])).toMatchObject({ image: true, text: true });
    expect(chatMessageParts(shown[1])).toMatchObject({ video: true });
  });
});
