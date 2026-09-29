import { readFileSync } from 'fs';
import path from 'path';
import {
  formatOfferMessage,
  parseOfferMessage,
} from '../lib/messageOffers';
import { formatListingPrice } from '../lib/messageListingContext';
import { filterMessageThreads } from '../hooks/useMessageThreads';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('message offers', () => {
  it('formats and parses price offers', () => {
    const text = formatOfferMessage(2200);
    expect(text).toContain('عرض سعر');
    expect(parseOfferMessage(text)?.amount).toBe(2200);
  });

  it('rejects invalid offer text', () => {
    expect(parseOfferMessage('مرحبا')).toBeNull();
  });
});

describe('message listing helpers', () => {
  it('formats SAR prices', () => {
    expect(formatListingPrice(2500)).toBe('2,500 ر.س');
  });
});

describe('message thread filters', () => {
  const threads = [
    {
      id: '1',
      type: 'DIRECT' as const,
      participant: {
        id: 'u1',
        displayName: 'Mohammed',
        arabicName: 'محمد',
        verified: false,
      },
      lastMessage: 'مرحبا',
      lastMessageAt: '2026-08-16T10:00:00.000Z',
      unread: 2,
    },
    {
      id: '2',
      type: 'DIRECT' as const,
      participant: {
        id: 'u2',
        displayName: 'Seller',
        arabicName: 'Seller',
        verified: false,
      },
      lastMessage: 'ok',
      lastMessageAt: '2026-08-16T11:00:00.000Z',
      unread: 0,
    },
  ];

  it('filters unread without a search tab', () => {
    expect(filterMessageThreads(threads, 'unread', '', {}).map((t) => t.id)).toEqual([
      '1',
    ]);
  });

  it('searches listing titles from a single search bar', () => {
    expect(
      filterMessageThreads(threads, 'all', 'حري', { u1: 'حري - جذع' }).map(
        (t) => t.id,
      ),
    ).toEqual(['1']);
  });
});

describe('chat thread background', () => {
  it('uses a plain white thread pane (wallpaper no longer drawn in the chat)', () => {
    const chat = src('app/chat.tsx');
    const wallpaper = src('components/feature/ChatThreadWallpaper.tsx');
    expect(chat).toContain('styles.threadPane');
    expect(chat).not.toContain('<ChatThreadWallpaper');
    expect(chat).toContain('backgroundColor: CHAT_BACKGROUND');
    const pane = chat.indexOf('style={styles.threadPane}');
    const listAt = chat.indexOf('style={styles.threadList}');
    expect(pane).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(pane);
    expect(chat).not.toContain('LinearGradient');
    // Legacy component kept (unused by chat) and still decorative-only.
    expect(wallpaper).toContain('pointerEvents="none"');
    expect(wallpaper).not.toContain('http');
    expect(src('components/feature/MessagesPanel.tsx')).not.toContain('ChatThreadWallpaper');
  });
});
