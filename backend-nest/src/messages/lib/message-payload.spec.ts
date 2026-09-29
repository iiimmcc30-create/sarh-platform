import {
  inboxPreview,
  isMessagePayloadError,
  notificationPreview,
  pushBody,
  resolveMessagePayload,
  VOICE_MAX_DURATION_MS,
} from './message-payload';

describe('resolveMessagePayload', () => {
  it('keeps plain text messages as TEXT', () => {
    expect(resolveMessagePayload({ text: '  مرحبا  ' })).toEqual({
      type: 'TEXT',
      text: 'مرحبا',
    });
  });

  it('infers legacy image / video payloads without messageType', () => {
    expect(
      resolveMessagePayload({ imageUrl: 'https://cdn.x/a.jpg' }),
    ).toMatchObject({ type: 'IMAGE', imageUrl: 'https://cdn.x/a.jpg' });
    expect(
      resolveMessagePayload({ videoUrl: 'https://cdn.x/a.mp4', text: 'شوف' }),
    ).toMatchObject({
      type: 'VIDEO',
      videoUrl: 'https://cdn.x/a.mp4',
      text: 'شوف',
    });
  });

  it('accepts an official VOICE message with duration', () => {
    const out = resolveMessagePayload({
      messageType: 'VOICE',
      audioUrl: 'https://cdn.x/v.m4a',
      durationMs: 4200.4,
      mediaMimeType: 'audio/mp4',
      mediaSizeBytes: 34000,
    });
    expect(out).toEqual({
      type: 'VOICE',
      audioUrl: 'https://cdn.x/v.m4a',
      mediaDurationMs: 4200,
      mediaMimeType: 'audio/mp4',
      mediaSizeBytes: 34000,
    });
  });

  it('rejects voice without a valid duration', () => {
    for (const durationMs of [
      undefined,
      0,
      -5,
      VOICE_MAX_DURATION_MS + 1,
      NaN,
    ]) {
      const out = resolveMessagePayload({
        audioUrl: 'https://cdn.x/v.webm',
        durationMs,
      });
      expect(isMessagePayloadError(out)).toBe(true);
    }
  });

  it('rejects empty, multi-media and mismatched kinds', () => {
    expect(resolveMessagePayload({ text: '   ' })).toMatchObject({
      code: 'empty_message',
    });
    expect(
      resolveMessagePayload({
        imageUrl: 'https://cdn.x/a.jpg',
        audioUrl: 'https://cdn.x/v.m4a',
        durationMs: 1000,
      }),
    ).toMatchObject({ code: 'invalid_message' });
    expect(
      resolveMessagePayload({
        messageType: 'VOICE',
        imageUrl: 'https://cdn.x/a.jpg',
      }),
    ).toMatchObject({ code: 'invalid_message' });
  });

  it('builds previews for every kind including legacy rows', () => {
    expect(inboxPreview({ text: 'hi' })).toBe('hi');
    expect(inboxPreview({ imageUrl: 'x' })).toBe('[صورة]');
    expect(inboxPreview({ videoUrl: 'x' })).toBe('[فيديو]');
    expect(inboxPreview({ audioUrl: 'x', type: 'VOICE' })).toBe(
      '[رسالة صوتية]',
    );
    expect(inboxPreview(null)).toBeNull();
    expect(notificationPreview({ audioUrl: 'x' })).toBe('🎤 رسالة صوتية');
    expect(notificationPreview({ videoUrl: 'x' })).toBe('🎬 فيديو');
    expect(pushBody({ audioUrl: 'x' })).toBe('أرسل رسالة صوتية');
    expect(pushBody({ imageUrl: 'x' })).toBe('أرسل صورة');
  });
});
