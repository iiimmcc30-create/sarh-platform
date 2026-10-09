import {
  DEFAULT_NOTIFICATION_PREFS,
  isPushAllowed,
  normalizeNotificationPrefs,
  notificationCategory,
} from './notification-prefs';

describe('notification prefs', () => {
  it('normalizes stored JSON: missing / bad keys default to on', () => {
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs([])).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizeNotificationPrefs({ follows: false, junk: false, offers: 'no' })).toEqual({
      ...DEFAULT_NOTIFICATION_PREFS,
      follows: false,
    });
  });

  it('maps notification types to categories', () => {
    expect(notificationCategory('new_message')).toBe('messages');
    expect(notificationCategory('follow')).toBe('follows');
    expect(notificationCategory('like')).toBe('interactions');
    expect(notificationCategory('story_reply')).toBe('interactions');
    expect(notificationCategory('live_start')).toBe('councils');
    expect(notificationCategory('system', { kind: 'council_invite' })).toBe('councils');
    expect(notificationCategory('system', { postId: 'p', authorId: 'a' })).toBe('followingPosts');
    expect(notificationCategory('offer')).toBe('offers');
    expect(notificationCategory('system', { listingId: 'l' })).toBe('account');
    expect(notificationCategory('fee_due')).toBe('account');
  });

  it('master switch wins; account notices cannot be switched off', () => {
    expect(isPushAllowed({ notificationsEnabled: false }, 'fee_due')).toBe(false);
    const prefs = {
      messages: false,
      follows: false,
      interactions: false,
      followingPosts: false,
      councils: false,
      offers: false,
    };
    expect(isPushAllowed({ notificationPrefs: prefs }, 'subscription_renew')).toBe(true);
    expect(isPushAllowed({ notificationPrefs: prefs }, 'comment')).toBe(false);
    expect(isPushAllowed({ notificationPrefs: { comment: false } }, 'comment')).toBe(true);
  });
});
