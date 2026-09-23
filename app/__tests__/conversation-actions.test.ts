import { readFileSync } from 'fs';
import path from 'path';
import {
  clampConversationSwipe,
  CONVERSATION_SWIPE_MAX,
  CONVERSATION_SWIPE_THRESHOLD,
  conversationMenuSize,
  placeConversationMenu,
  shouldCaptureConversationSwipe,
  shouldRevealConversationDelete,
} from '../lib/conversationActions';
import {
  applyInboxThreadPreview,
  fetchMessageInbox,
  getCachedMessageInbox,
  removeInboxThread,
  resetMessageInboxCache,
  setInboxThreadPinned,
} from '../hooks/useMessageThreads';
import { resetRequestCoordination } from '../services/requestCoordination';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

const fetchWithTimeout = jest.fn();
jest.mock('@/services/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

jest.mock('@/services/api', () => ({
  API_BASE: 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function threadRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'DIRECT',
    lastMessage: 'مرحبا',
    lastMessageAt: extra.lastMessageAt ?? '2026-09-16T10:00:00.000Z',
    unread: 0,
    isMine: false,
    isPinned: extra.isPinned ?? false,
    participant: {
      id: `peer-${id}`,
      displayName: id,
      arabicName: id,
      verified: false,
    },
    ...extra,
  };
}

describe('conversation swipe math', () => {
  it('captures a physical right swipe and ignores vertical jitter', () => {
    expect(shouldCaptureConversationSwipe(12, 2)).toBe(true);
    expect(shouldCaptureConversationSwipe(4, 1)).toBe(false);
    expect(shouldCaptureConversationSwipe(12, 20)).toBe(false);
    expect(shouldCaptureConversationSwipe(-20, 0)).toBe(false);
  });

  it('clamps the reveal and snaps back below the delete threshold', () => {
    expect(clampConversationSwipe(-10)).toBe(0);
    expect(clampConversationSwipe(40)).toBe(40);
    expect(clampConversationSwipe(200)).toBe(CONVERSATION_SWIPE_MAX);
    expect(shouldRevealConversationDelete(CONVERSATION_SWIPE_THRESHOLD - 1)).toBe(
      false,
    );
    expect(shouldRevealConversationDelete(CONVERSATION_SWIPE_THRESHOLD)).toBe(true);
  });
});

describe('conversation context menu placement', () => {
  const menu = conversationMenuSize(2);
  const window = { width: 390, height: 800 };
  const insets = { top: 47, bottom: 34 };

  it('opens below a mid-list row and stays on screen', () => {
    const pos = placeConversationMenu(
      { x: 16, y: 200, width: 358, height: 76 },
      window,
      insets,
      menu,
    );
    expect(pos.top).toBeGreaterThan(200);
    expect(pos.left + menu.width).toBeLessThanOrEqual(window.width - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it('opens above a row near the bottom and below a row near the top', () => {
    const nearBottom = placeConversationMenu(
      { x: 16, y: 720, width: 358, height: 76 },
      window,
      insets,
      menu,
    );
    expect(nearBottom.top + menu.height).toBeLessThanOrEqual(
      window.height - insets.bottom - 8,
    );
    expect(nearBottom.top).toBeLessThan(720);

    const nearTop = placeConversationMenu(
      { x: 16, y: 56, width: 358, height: 76 },
      window,
      insets,
      menu,
    );
    expect(nearTop.top).toBeGreaterThanOrEqual(insets.top + 8);
    expect(nearTop.top).toBeGreaterThan(56);
  });
});

describe('inbox pin and hide cache', () => {
  beforeEach(() => {
    resetMessageInboxCache();
    resetRequestCoordination();
    fetchWithTimeout.mockReset();
    fetchWithTimeout.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('type=DIRECT')) {
        return jsonResponse({
          success: true,
          data: [
            threadRow('older', { lastMessageAt: '2026-09-16T09:00:00.000Z' }),
            threadRow('newer', { lastMessageAt: '2026-09-16T12:00:00.000Z' }),
          ],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
  });

  afterEach(() => {
    resetMessageInboxCache();
    resetRequestCoordination();
  });

  it('pins a conversation to the top without a full reload', async () => {
    await fetchMessageInbox('token-a');
    fetchWithTimeout.mockClear();
    const next = setInboxThreadPinned('older', true);
    expect(next?.map((t) => t.id)).toEqual(['older', 'newer']);
    expect(next?.[0]?.isPinned).toBe(true);
    expect(getCachedMessageInbox('ALL')?.map((t) => t.id)).toEqual([
      'older',
      'newer',
    ]);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('unpins back to last-message order', async () => {
    await fetchMessageInbox('token-a');
    setInboxThreadPinned('older', true);
    const next = setInboxThreadPinned('older', false);
    expect(next?.map((t) => t.id)).toEqual(['newer', 'older']);
    expect(next?.[0]?.isPinned).toBe(false);
  });

  it('removes a hidden conversation from the cached list', async () => {
    await fetchMessageInbox('token-a');
    const next = removeInboxThread('newer');
    expect(next?.map((t) => t.id)).toEqual(['older']);
    applyInboxThreadPreview({
      threadId: 'newer',
      lastMessage: 'still gone unless participant is sent',
    });
    expect(getCachedMessageInbox('ALL')?.map((t) => t.id)).toEqual(['older']);
  });
});

describe('search and messages chrome wiring', () => {
  it('hides the shared tab bar from Search scroll without a second collapse system', () => {
    const search = src('app/search.tsx');
    const chrome = src('hooks/useAppChrome.ts');
    expect(search).toContain('bindChromeScroll={false}');
    expect(search).toContain('onChromeScroll(event)');
    expect(search).toContain('useCollapsibleSearchHeader(SHELL_IDENTITY_COLLAPSE_H)');
    expect(chrome).toContain('HIDE_ACCUM');
    expect(chrome).toContain('SHOW_ACCUM');
    expect(chrome).toContain('y <= TOP_REVEAL_Y');
  });

  it('reuses AppFlatList chrome hide on the messages inbox', () => {
    const panel = src('components/feature/MessagesPanel.tsx');
    const list = src('components/ui/AppFlatList.tsx');
    expect(panel).toContain('AppFlatList');
    expect(list).toContain('useBindChromeScroll');
    expect(src('hooks/useAppChrome.ts')).toContain('onChromeScroll(event)');
  });
});

describe('conversation row actions', () => {
  it('wires swipe-right delete and a small long-press menu to one handler', () => {
    const panel = src('components/feature/MessagesPanel.tsx');
    const swipe = src('components/feature/ConversationSwipeRow.tsx');
    const menu = src('components/feature/ConversationContextMenu.tsx');
    expect(panel).toContain('handleDeleteConversation');
    expect(panel).toContain('confirmDestructive');
    expect(panel).toContain('حذف المحادثة؟');
    expect(panel).toContain('ConversationSwipeRow');
    expect(panel).toContain('ConversationContextMenu');
    expect(panel).toContain('handlePinConversation');
    expect(swipe).toContain('PanResponder');
    expect(swipe).toContain('shouldCaptureConversationSwipe');
    expect(swipe).toContain('conversationDeleteStripAnchor');
    expect(swipe).not.toContain('row-reverse');
    expect(swipe).toContain('name="trash"');
    expect(swipe).not.toContain('حذف المحادثة');
    expect(menu).toContain('تثبيت المحادثة');
    expect(menu).toContain('إلغاء تثبيت المحادثة');
    expect(menu).toContain('حذف المحادثة');
    expect(menu).toContain('placeConversationMenu');
    expect(menu).not.toContain('ActionSheet');
    expect(menu).not.toContain('BottomSheet');
  });

  it('keeps hide and pin on the existing messages module cache and API', () => {
    const hook = src('hooks/useMessageThreads.ts');
    const controller = readFileSync(
      path.join(root, '..', 'backend-nest/src/messages/messages.controller.ts'),
      'utf8',
    );
    const service = readFileSync(
      path.join(root, '..', 'backend-nest/src/messages/messages.service.ts'),
      'utf8',
    );
    expect(hook).toContain('hideMessageThread');
    expect(hook).toContain('pinMessageThread');
    expect(hook).toContain('setInboxThreadPinned');
    expect(hook).toContain('removeInboxThread');
    expect(hook).toContain("method: 'DELETE'");
    expect(hook).toContain('/pin');
    expect(controller).toContain("@Patch(':threadId/pin')");
    expect(controller).toContain("@Delete(':threadId')");
    expect(service).toContain('requireThreadForUser');
    expect(service).toContain('hiddenAt');
    expect(service).toContain('pinnedAt');
  });
});
