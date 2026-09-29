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

/** Preferred MediaRecorder formats (webm/opus first; Safari falls back to mp4). */
export const WEB_VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

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
