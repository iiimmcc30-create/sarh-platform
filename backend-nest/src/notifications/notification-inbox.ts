import { Prisma } from '@prisma/client';

export type NotificationInboxTab = 'all' | 'mentions';

export function parseNotificationTab(raw: unknown): NotificationInboxTab {
  return raw === 'mentions' ? 'mentions' : 'all';
}

/**
 * «الإشارات»: a direct reply or an @ mention.
 * The platform has direct replies (listing-comment replies, story replies).
 * It does not have a mention graph; `mention` / `data.mention` is accepted so
 * a future writer shows up here without another client change.
 */
export function mentionsNotificationWhere(
  userId: string,
): Prisma.NotificationWhereInput {
  return {
    userId,
    OR: [
      { type: 'story_reply' },
      {
        type: 'comment',
        OR: [
          { data: { path: ['reply'], equals: '1' } },
          { data: { path: ['mention'], equals: '1' } },
          { data: { path: ['parentId'], string_contains: '-' } },
        ],
      },
      {
        type: 'system',
        OR: [
          { data: { path: ['kind'], equals: 'mention' } },
          { data: { path: ['reply'], equals: '1' } },
        ],
      },
    ],
  };
}
