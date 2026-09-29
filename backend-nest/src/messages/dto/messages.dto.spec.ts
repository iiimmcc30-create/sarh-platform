import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendMessageDto } from './messages.dto';
import { ChatSendDto } from '../../gateway/dto/socket-events.dto';

const RECEIVER = '22222222-2222-4222-8222-222222222222';
const THREAD = '11111111-1111-4111-8111-111111111111';

function errorsFor<T extends object>(cls: new () => T, body: object): string[] {
  return validateSync(plainToInstance(cls, body) as object).map(
    (e) => e.property,
  );
}

describe('SendMessageDto voice validation', () => {
  it('accepts a VOICE message with audioUrl + duration', () => {
    expect(
      errorsFor(SendMessageDto, {
        receiverId: RECEIVER,
        messageType: 'VOICE',
        audioUrl: 'https://res.cloudinary.com/demo/video/upload/v1/a.m4a',
        durationMs: 3500,
        mediaMimeType: 'audio/mp4',
        mediaSizeBytes: 28000,
      }),
    ).toEqual([]);
  });

  it('requires audioUrl and durationMs for VOICE', () => {
    const errs = errorsFor(SendMessageDto, {
      receiverId: RECEIVER,
      messageType: 'VOICE',
    });
    expect(errs).toEqual(expect.arrayContaining(['audioUrl', 'durationMs']));
  });

  it('rejects unknown types, bad mimes and oversize durations', () => {
    const errs = errorsFor(SendMessageDto, {
      receiverId: RECEIVER,
      messageType: 'STICKER',
      audioUrl: 'https://cdn.x/a.m4a',
      durationMs: 10 * 60 * 1000,
      mediaMimeType: 'application/x-msdownload',
    });
    expect(errs).toEqual(
      expect.arrayContaining(['messageType', 'durationMs', 'mediaMimeType']),
    );
  });

  it('keeps legacy text / image payloads valid', () => {
    expect(
      errorsFor(SendMessageDto, { receiverId: RECEIVER, text: 'hi' }),
    ).toEqual([]);
    expect(
      errorsFor(SendMessageDto, {
        receiverId: RECEIVER,
        imageUrl: 'https://cdn.x/a.jpg',
      }),
    ).toEqual([]);
  });
});

describe('ChatSendDto voice validation', () => {
  it('accepts an audio-only socket send', () => {
    expect(
      errorsFor(ChatSendDto, {
        threadId: THREAD,
        receiverId: RECEIVER,
        audioUrl: 'https://cdn.x/a.webm',
        durationMs: 1200,
      }),
    ).toEqual([]);
  });

  it('rejects audio without duration and empty sends', () => {
    expect(
      errorsFor(ChatSendDto, {
        threadId: THREAD,
        receiverId: RECEIVER,
        audioUrl: 'https://cdn.x/a.webm',
      }),
    ).toContain('durationMs');
    expect(
      errorsFor(ChatSendDto, { threadId: THREAD, receiverId: RECEIVER }),
    ).toContain('_textOrMedia');
  });
});
