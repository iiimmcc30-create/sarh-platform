import {
  mentionsNotificationWhere,
  parseNotificationTab,
} from './notification-inbox';

describe('notification inbox tabs', () => {
  it('defaults unknown tabs to all', () => {
    expect(parseNotificationTab(undefined)).toBe('all');
    expect(parseNotificationTab('all')).toBe('all');
    expect(parseNotificationTab('mentions')).toBe('mentions');
    expect(parseNotificationTab('likes')).toBe('all');
  });

  it('mentions filter is replies and mentions only', () => {
    const where = mentionsNotificationWhere('user-1');
    expect(where.userId).toBe('user-1');
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or).toEqual(
      expect.arrayContaining([
        { type: 'story_reply' },
        expect.objectContaining({ type: 'comment' }),
      ]),
    );
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('reply');
    expect(serialized).toContain('parentId');
    expect(serialized).toContain('mention');
    expect(serialized).not.toContain('like');
    expect(serialized).not.toContain('council');
  });
});
