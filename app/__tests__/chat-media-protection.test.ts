/**
 * Chat media hardening: protected uploads, voice temp-file cleanup,
 * web MediaRecorder mime detection, and the Search page divider removal.
 */
import fs from 'fs';
import path from 'path';

import {
  VOICE_UPLOAD_MIMES,
  detectWebVoiceSupport,
  normalizeVoiceUploadMime,
  pickWebVoiceMime,
} from '@/lib/voiceRecording';
import { deleteTempRecording, tempRecordingSize } from '@/lib/voiceTempFile';
import * as webTempFile from '@/lib/voiceTempFile.web';
import { onceCleanup } from '@/lib/onceCleanup';

const mockFiles = new Map<string, { size: number }>();
const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    delete() {
      if (this.uri.includes('locked')) throw new Error('EACCES');
      mockFiles.delete(this.uri);
      mockDeleted.push(this.uri);
    }
  },
}));

const root = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('protected chat uploads (client)', () => {
  const upload = read('services/upload.ts');

  it('opts chat uploads into authenticated delivery only on the chat path', () => {
    expect(upload).toMatch(
      /folder === 'messages' && options \? \{ delivery: 'authenticated' \} : \{\}/,
    );
  });

  it('sends the signed `type` field only when the slot carries it', () => {
    expect(upload).toContain("if (c.type) form.append('type', c.type);");
    expect(upload).toContain("if (slot.type) form.append('type', slot.type);");
  });
});

describe('web voice recording mime detection', () => {
  it('prefers webm/opus when supported (Chrome/Firefox)', () => {
    expect(
      detectWebVoiceSupport({
        hasGetUserMedia: true,
        MediaRecorder: { isTypeSupported: () => true },
      }),
    ).toEqual({ supported: true, mimeType: 'audio/webm;codecs=opus' });
  });

  it('falls back to mp4/AAC on Safari', () => {
    const safari = (m: string) => m.startsWith('audio/mp4');
    const picked = pickWebVoiceMime(safari);
    expect(picked).toMatch(/^audio\/mp4/);
    expect(normalizeVoiceUploadMime(picked)).toBe('audio/mp4');
  });

  it('reports unsupported (no crash) without MediaRecorder / getUserMedia / formats', () => {
    expect(detectWebVoiceSupport({ hasGetUserMedia: true })).toEqual({ supported: false });
    expect(
      detectWebVoiceSupport({ hasGetUserMedia: false, MediaRecorder: { isTypeSupported: () => true } }),
    ).toEqual({ supported: false });
    expect(
      detectWebVoiceSupport({ hasGetUserMedia: true, MediaRecorder: { isTypeSupported: () => false } }),
    ).toEqual({ supported: false });
    expect(detectWebVoiceSupport({ hasGetUserMedia: true, MediaRecorder: {} })).toEqual({
      supported: true,
      mimeType: undefined,
    });
  });

  it('normalizes recorder mimes to types the backend accepts', () => {
    expect(normalizeVoiceUploadMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeVoiceUploadMime('video/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeVoiceUploadMime('video/mp4')).toBe('audio/mp4');
    expect(normalizeVoiceUploadMime('audio/x-m4a')).toBe('audio/x-m4a');
    expect(normalizeVoiceUploadMime('audio/wav')).toBeNull();
    expect(normalizeVoiceUploadMime('')).toBeNull();
  });

  it('client voice mimes mirror the backend whitelist', () => {
    const backend = fs.readFileSync(
      path.join(root, '..', 'backend-nest', 'src', 'upload', 'upload.service.ts'),
      'utf8',
    );
    const block = backend.slice(backend.indexOf('MESSAGE_AUDIO_MIME_TYPES = ['));
    const list = block.slice(0, block.indexOf(']'));
    for (const mime of VOICE_UPLOAD_MIMES) expect(list).toContain(`'${mime}'`);
  });

  it('uses detection + normalization in the recorder hook, with an Arabic fallback', () => {
    const hook = read('hooks/useVoiceRecorder.ts');
    expect(hook).toContain('detectWebVoiceSupport(');
    expect(hook).toContain('normalizeVoiceUploadMime(');
    expect(hook).toContain('VOICE_ERRORS.unsupported');
    expect(hook).toContain('recorder = new MR(stream);');
  });
});

describe('native temp voice file cleanup', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDeleted.length = 0;
  });

  it('deletes app-local recordings and reports their size', () => {
    mockFiles.set('file:///cache/rec.m4a', { size: 4096 });
    expect(tempRecordingSize('file:///cache/rec.m4a')).toBe(4096);
    expect(deleteTempRecording('file:///cache/rec.m4a')).toBe(true);
    expect(mockDeleted).toEqual(['file:///cache/rec.m4a']);
    expect(deleteTempRecording('file:///cache/rec.m4a')).toBe(false);
  });

  it('never touches non-file URIs and swallows delete errors', () => {
    expect(deleteTempRecording('blob:https://sarh/abc')).toBe(false);
    expect(deleteTempRecording(undefined)).toBe(false);
    mockFiles.set('file:///cache/locked.m4a', { size: 1 });
    expect(() => deleteTempRecording('file:///cache/locked.m4a')).not.toThrow();
  });

  it('web variant is a no-op', () => {
    expect(webTempFile.deleteTempRecording('file:///x.m4a')).toBe(false);
    expect(webTempFile.tempRecordingSize('file:///x.m4a')).toBeUndefined();
  });

  it('cleanup runs once and never throws', () => {
    const fn = jest.fn(() => {
      throw new Error('boom');
    });
    const dispose = onceCleanup(fn);
    expect(() => dispose()).not.toThrow();
    dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recorder deletes the file on cancel, too-short and stop failure', () => {
    const hook = read('hooks/useVoiceRecorder.ts');
    const cancelBlock = hook.slice(hook.indexOf('const cancel = useCallback'));
    expect(cancelBlock.slice(0, 600)).toContain('deleteTempRecording(recorder.uri)');
    expect(hook).toMatch(/VOICE_MIN_DURATION_MS\) \{\s*deleteTempRecording\(uri\);/);
    expect(hook).toContain('dispose: onceCleanup(() => {\n          deleteTempRecording(uri);');
    expect(hook).toContain('onAutoStop');
  });

  it('chat releases the file after upload success, final failure or unmount — not mid-upload', () => {
    const chat = read('app/chat.tsx');
    expect(chat).toContain('media.uploadedUrl = url;');
    expect(chat).toMatch(/media\.uploadedUrl = url;\s*if \(media\.kind === 'audio' && media\.dispose\) \{/);
    expect(chat).toContain("if (err instanceof UploadError && err.code === 'too_large') finalizeMediaJob(id);");
    expect(chat).toContain('if (err instanceof FinalSendError) finalizeMediaJob(tempId);');
    expect(chat).toContain('if (inFlight.has(id)) continue;');
    expect(chat).toContain('if (unmountedRef.current) finalizeMediaJob(id);');
  });
});

describe('Search page has no section dividers', () => {
  const search = read('app/search.tsx');

  it('content rows carry no hairline separators', () => {
    expect(search).not.toContain('colors.borderHairline');
    for (const style of ['suggestRow', 'recentRow', 'userRow', 'resultRow']) {
      const start = search.indexOf(`    ${style}: {`);
      expect(start).toBeGreaterThan(-1);
      const body = search.slice(start, search.indexOf('},', start));
      expect(body).not.toMatch(/border(Bottom|Top)?Width/);
    }
  });

  it('keeps row spacing tokens', () => {
    expect(search).toMatch(/suggestRow: \{\s*paddingVertical: 12,/);
    expect(search).toMatch(/resultRow: \{\s*paddingVertical: 12,/);
  });
});
