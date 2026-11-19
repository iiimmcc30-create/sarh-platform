import {
  arabicNumeral,
  groupNotifications,
  isSignalNotification,
  type InboxNotification,
} from '@/lib/notificationInbox';

function row(partial: Partial<InboxNotification> & Pick<InboxNotification, 'id' | 'type'>): InboxNotification {
  return {
    titleAr: 'عنوان',
    bodyAr: 'نص',
    data: null,
    isRead: false,
    createdAt: '2026-11-19T10:00:00.000Z',
    ...partial,
  };
}

describe('notification inbox grouping', () => {
  it('groups likes on the same post as «فلان و٣ آخرين أعجبهم منشورك»', () => {
    const items = ['سعد', 'فهد', 'علي', 'نورة'].map((name, index) =>
      row({
        id: `l${index}`,
        type: 'like',
        isRead: index !== 0,
        createdAt: new Date(Date.parse('2026-11-19T10:00:00.000Z') - index * 60_000).toISOString(),
        data: { postId: 'p1', actorId: `u${index}`, actorName: name, actorAvatar: null },
      }),
    );
    const [group] = groupNotifications(items);
    expect(group.kind).toBe('like');
    expect(group.peopleCount).toBe(4);
    expect(group.ids).toHaveLength(4);
    expect(group.isRead).toBe(false);
    expect(group.parts.map((part) => part.text).join('')).toBe(
      `سعد و${arabicNumeral(3)} آخرين أعجبهم منشورك`,
    );
    expect(group.parts[0].strong).toBe(true);
    expect(group.actors).toHaveLength(4);
  });

  it('does not merge likes older than a day or on another post', () => {
    const items = [
      row({
        id: 'new',
        type: 'like',
        createdAt: '2026-11-19T10:00:00.000Z',
        data: { postId: 'p1', actorId: 'a', actorName: 'سعد' },
      }),
      row({
        id: 'old',
        type: 'like',
        createdAt: '2026-11-17T10:00:00.000Z',
        data: { postId: 'p1', actorId: 'b', actorName: 'فهد' },
      }),
      row({
        id: 'other',
        type: 'like',
        createdAt: '2026-11-19T09:00:00.000Z',
        data: { postId: 'p2', actorId: 'c', actorName: 'علي' },
      }),
    ];
    const groups = groupNotifications(items);
    expect(groups).toHaveLength(3);
  });

  it('groups follows and reposts, and leaves comments and councils alone', () => {
    const items = [
      row({
        id: 'c1',
        type: 'system',
        bodyAr: 'أبو سعد بدأ المجلس «الإبل»',
        data: { kind: 'council_live', councilId: 'c', actorName: 'أبو سعد', locked: '1' },
      }),
      row({
        id: 'f1',
        type: 'follow',
        createdAt: '2026-11-19T09:00:00.000Z',
        data: { actorId: 'a', actorName: 'سعد' },
      }),
      row({
        id: 'f2',
        type: 'follow',
        createdAt: '2026-11-19T08:00:00.000Z',
        data: { actorId: 'b', actorName: 'فهد' },
      }),
      row({
        id: 'r1',
        type: 'repost',
        data: { postId: 'p', actorId: 'a', actorName: 'سعد' },
      }),
      row({
        id: 'm1',
        type: 'comment',
        bodyAr: 'ردّ سعد على تعليقك',
        data: { parentId: 'parent-1', reply: '1', actorId: 'a', actorName: 'سعد' },
      }),
    ];
    const groups = groupNotifications(items);
    expect(groups.map((group) => group.kind)).toEqual(['council', 'follow', 'repost', 'reply']);
    expect(groups[0].actionLabel).toBe('انضم');
    expect(groups[1].peopleCount).toBe(2);
    expect(groups[1].parts.map((part) => part.text).join('')).toContain('سعد وفهد');
    expect(groups[1].parts.map((part) => part.text).join('')).toContain('بدآ بمتابعتك');
  });

  it('puts only replies and mentions in الإشارات', () => {
    const like = row({ id: '1', type: 'like', data: { postId: 'p' } });
    const comment = row({ id: '2', type: 'comment', data: { postId: 'p', actorName: 'سعد' } });
    const reply = row({ id: '3', type: 'comment', data: { reply: '1', parentId: 'x' } });
    const story = row({ id: '4', type: 'story_reply', data: { storyId: 's' } });
    const council = row({ id: '5', type: 'system', data: { kind: 'council_live' } });
    const review = row({ id: '6', type: 'system', data: { kind: 'review' } });
    expect(isSignalNotification(like)).toBe(false);
    expect(isSignalNotification(comment)).toBe(false);
    expect(isSignalNotification(reply)).toBe(true);
    expect(isSignalNotification(story)).toBe(true);
    expect(isSignalNotification(council)).toBe(false);
    expect(isSignalNotification(review)).toBe(false);
  });
});
