/**
 * Voice-note recording config + helpers (pure — no native imports, testable).
 * Native: m4a / AAC, mono, ~64 kbps. Web: MediaRecorder webm/opus.
 */
import type { RecordingOptions } from 'expo-audio';

/** Hard cap (auto-stop) — mirrors backend VOICE_MAX_DURATION_MS. */
export const VOICE_MAX_DURATION_MS = 5 * 60 * 1000;
/** Shorter taps are treated as accidental and discarded. */
export const VOICE_MIN_DURATION_MS = 700;
export const VOICE_BITRATE = 64_000;

export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44_100,
  numberOfChannels: 1,
  bitRate: VOICE_BITRATE,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    // IOSOutputFormat.MPEG4AAC / AudioQuality.MEDIUM (literal values keep this file native-free)
    outputFormat: 'aac ',
    audioQuality: 64,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: VOICE_BITRATE,
  },
};

/**
 * Preferred MediaRecorder formats, feature-detected with
 * `MediaRecorder.isTypeSupported`: webm/opus (Chrome/Firefox/Edge) first,
 * then mp4/AAC (Safari), then ogg / aac / mpeg.
 */
export const WEB_VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/aac',
  'audio/mpeg',
] as const;

/** Base audio types the backend accepts for voice notes (`MESSAGE_AUDIO_MIME_TYPES`). */
export const VOICE_UPLOAD_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
] as const;

/**
 * Map a recorder-reported mime to one the backend accepts, or null.
 * Some browsers report the container as `video/webm` / `video/mp4` for
 * audio-only recordings; those are the same bytes as the audio types.
 */
export function normalizeVoiceUploadMime(mime: string | undefined | null): string | null {
  const base = baseMime(mime);
  if (!base) return null;
  if ((VOICE_UPLOAD_MIMES as readonly string[]).includes(base)) return base;
  if (base === 'video/webm' || base === 'audio/x-matroska') return 'audio/webm';
  if (base === 'video/mp4') return 'audio/mp4';
  return null;
}

export type WebVoiceSupport =
  | { supported: true; mimeType: string | undefined }
  | { supported: false };

/**
 * Feature-detect web voice recording. `mimeType` undefined means the browser
 * has MediaRecorder but no `isTypeSupported`; the recorder default is then
 * validated after start via `normalizeVoiceUploadMime`.
 */
export function detectWebVoiceSupport(env: {
  hasGetUserMedia: boolean;
  MediaRecorder?: { isTypeSupported?: (mime: string) => boolean } | undefined;
}): WebVoiceSupport {
  if (!env.hasGetUserMedia || !env.MediaRecorder) return { supported: false };
  const isTypeSupported = env.MediaRecorder.isTypeSupported;
  if (typeof isTypeSupported !== 'function') return { supported: true, mimeType: undefined };
  const mimeType = pickWebVoiceMime(isTypeSupported.bind(env.MediaRecorder));
  return mimeType ? { supported: true, mimeType } : { supported: false };
}

export function pickWebVoiceMime(
  isTypeSupported: ((mime: string) => boolean) | undefined,
): string | undefined {
  if (!isTypeSupported) return undefined;
  return WEB_VOICE_MIME_CANDIDATES.find((m) => {
    try {
      return isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

/** `audio/webm;codecs=opus` -> `audio/webm` (upload whitelist uses base types). */
export function baseMime(mime: string | undefined | null): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

export const VOICE_ERRORS = {
  permissionDenied:
    'لم يتم السماح باستخدام الميكروفون. فعّل إذن الميكروفون من إعدادات الجهاز أو المتصفح لإرسال رسالة صوتية.',
  noMicrophone: 'لم يتم العثور على ميكروفون متاح على هذا الجهاز.',
  unsupported: 'تسجيل الصوت غير مدعوم في هذا المتصفح.',
  busy: 'الميكروفون مستخدم من تطبيق آخر. أغلقه وحاول مجدداً.',
  failed: 'تعذّر بدء التسجيل الصوتي. حاول مرة أخرى.',
  tooShort: 'التسجيل قصير جداً. اضغط على الميكروفون وتحدث ثم أرسل.',
} as const;

/** Map recorder / getUserMedia failures to a clear Arabic message. */
export function voiceErrorMessage(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message).toLowerCase()
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || message.includes('permission')) {
    return VOICE_ERRORS.permissionDenied;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return VOICE_ERRORS.noMicrophone;
  if (name === 'NotReadableError' || name === 'AbortError') return VOICE_ERRORS.busy;
  if (name === 'NotSupportedError') return VOICE_ERRORS.unsupported;
  return VOICE_ERRORS.failed;
}
