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
