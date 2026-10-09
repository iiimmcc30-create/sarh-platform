import { collectPushTokens } from './push-tokens';

describe('collectPushTokens (H11 multi-device FCM)', () => {
  it('includes legacy User.fcmToken and device rows without duplicates', () => {
    const tokens = collectPushTokens({
      fcmToken: 'tok-a',
      deviceTokens: [{ token: 'tok-a' }, { token: 'tok-b' }],
    });
    expect(tokens.sort()).toEqual(['tok-a', 'tok-b']);
  });

  it('returns empty when notifications are disabled', () => {
    expect(
      collectPushTokens({
        fcmToken: 'tok-a',
        deviceTokens: [{ token: 'tok-b' }],
        notificationsEnabled: false,
      }),
    ).toEqual([]);
  });

  it('falls back to legacy column when no device rows exist', () => {
    expect(collectPushTokens({ fcmToken: 'legacy' })).toEqual(['legacy']);
  });
});

describe('collectPushTokens per-type prefs (Settings → الإشعارات)', () => {
  const base = { fcmToken: 'tok' };

  it('drops push for a switched-off category', () => {
    expect(
      collectPushTokens(
        { ...base, notificationPrefs: { messages: false } },
        { type: 'new_message' },
      ),
    ).toEqual([]);
  });

  it('keeps other categories and account notices on', () => {
    const user = {
      ...base,
      notificationPrefs: { messages: false, councils: false },
    };
    expect(collectPushTokens(user, { type: 'follow' })).toEqual(['tok']);
    expect(collectPushTokens(user, { type: 'subscription_renew' })).toEqual([
      'tok',
    ]);
    expect(
      collectPushTokens(user, {
        type: 'system',
        data: { kind: 'council_live', councilId: 'c' },
      }),
    ).toEqual([]);
  });

  it('ignores prefs when no notification is given (legacy callers)', () => {
    expect(
      collectPushTokens({ ...base, notificationPrefs: { messages: false } }),
    ).toEqual(['tok']);
  });
});
