import {
  buildExpoMessage,
  EXPO_PUSH_URL,
  isExpoPushToken,
  pushTransportFor,
  sendExpoPush,
} from './push-transport';

const FCM =
  'dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx6Y0Q8jD3eF7gH9iJ0kL1mN2oP3qR4sT5uV6wX7yZ8';
const APNS = 'a'.repeat(64);
const EXPO = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

describe('pushTransportFor', () => {
  it('routes Expo tokens to the Expo push service', () => {
    expect(pushTransportFor(EXPO)).toBe('expo');
    expect(pushTransportFor('ExpoPushToken[abc]')).toBe('expo');
    expect(isExpoPushToken(EXPO)).toBe(true);
  });

  it('routes FCM registration tokens to firebase-admin', () => {
    expect(pushTransportFor(FCM)).toBe('fcm');
  });

  it('flags raw 64-hex APNs tokens (old iOS builds) as undeliverable', () => {
    expect(pushTransportFor(APNS)).toBe('apns_raw');
    expect(pushTransportFor(APNS.toUpperCase())).toBe('apns_raw');
  });
});

describe('sendExpoPush', () => {
  const message = buildExpoMessage({
    token: EXPO,
    titleAr: 'عنوان',
    bodyAr: 'نص',
    data: { type: 'message' },
  });

  function fakeFetch(status: number, body: unknown) {
    return jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it('builds an Android-channel, high-priority message with data', () => {
    expect(message).toEqual({
      to: EXPO,
      title: 'عنوان',
      body: 'نص',
      data: { type: 'message' },
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'default',
    });
  });

  it('posts to the Expo API and returns ok on an ok ticket', async () => {
    const fetchImpl = fakeFetch(200, { data: { status: 'ok', id: 't1' } });
    const res = await sendExpoPush(message, {
      fetchImpl,
      accessToken: 'secret',
    });
    expect(res).toEqual({ ok: true, ticketId: 't1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toEqual(message);
  });

  it('omits Authorization without an access token', async () => {
    const fetchImpl = fakeFetch(200, { data: [{ status: 'ok' }] });
    await sendExpoPush(message, { fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('marks DeviceNotRegistered as unregistered (token pruned)', async () => {
    const fetchImpl = fakeFetch(200, {
      data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });
    expect(await sendExpoPush(message, { fetchImpl })).toEqual({
      ok: false,
      unregistered: true,
      retryable: false,
      error: 'DeviceNotRegistered',
    });
  });

  it('treats 5xx as retryable', async () => {
    const fetchImpl = fakeFetch(503, {});
    const res = await sendExpoPush(message, { fetchImpl });
    expect(res).toMatchObject({ ok: false, retryable: true });
  });
});
