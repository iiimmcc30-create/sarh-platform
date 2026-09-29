/**
 * Voice-note recorder.
 * - Native (Android/iOS): expo-audio, m4a/AAC mono ~64 kbps.
 * - Web: MediaRecorder (webm/opus, Safari mp4 fallback).
 * Permission is requested on first use; failures return Arabic messages and
 * never block text / image / video sending.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  VOICE_ERRORS,
  VOICE_MAX_DURATION_MS,
  VOICE_MIN_DURATION_MS,
  VOICE_RECORDING_OPTIONS,
  detectWebVoiceSupport,
  normalizeVoiceUploadMime,
  voiceErrorMessage,
} from '@/lib/voiceRecording';
import { deleteTempRecording, tempRecordingSize } from '@/lib/voiceTempFile';
import { onceCleanup } from '@/lib/onceCleanup';

export type VoiceRecording = {
  uri: string;
  mimeType: string;
  durationMs: number;
  sizeBytes?: number;
  /**
   * Release temp resources: deletes the native temp file / revokes the web
   * object URL. Idempotent; call after upload success, final failure or cancel.
   */
  dispose: () => void;
};

export type VoiceRecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping';

export type VoiceStartResult = { ok: true } | { ok: false; error: string };
export type VoiceStopResult =
  | { ok: true; recording: VoiceRecording }
  | { ok: false; error?: string };

export type VoiceRecorderOptions = {
  /** Receives the recording when the 5-minute cap stops it automatically. */
  onAutoStop?: (result: VoiceStopResult) => void;
};

export type VoiceRecorderApi = {
  status: VoiceRecorderStatus;
  durationMs: number;
  start: () => Promise<VoiceStartResult>;
  stop: () => Promise<VoiceStopResult>;
  cancel: () => Promise<void>;
};

function useElapsedTimer() {
  const [durationMs, setDurationMs] = useState(0);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);
  const begin = useCallback(
    (onLimit: () => void) => {
      clear();
      startedAtRef.current = Date.now();
      setDurationMs(0);
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setDurationMs(elapsed);
        if (elapsed >= VOICE_MAX_DURATION_MS) onLimit();
      }, 250);
    },
    [clear],
  );
  const elapsed = useCallback(() => Date.now() - startedAtRef.current, []);
  useEffect(() => clear, [clear]);
  return { durationMs, setDurationMs, begin, clear, elapsed };
}

/** Auto-stop at the cap: hand the recording over, or clean it up if unclaimed. */
function useAutoStopHandler(options?: VoiceRecorderOptions) {
  const onAutoStop = options?.onAutoStop;
  const onAutoStopRef = useRef(onAutoStop);
  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);
  return useCallback((result: VoiceStopResult) => {
    const handler = onAutoStopRef.current;
    if (handler) handler(result);
    else if (result.ok) result.recording.dispose();
  }, []);
}

function useNativeVoiceRecorder(options?: VoiceRecorderOptions): VoiceRecorderApi {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const handleAutoStop = useAutoStopHandler(options);
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const {
    durationMs: elapsedMs,
    setDurationMs: setElapsedMs,
    begin: beginTimer,
    clear: clearTimer,
    elapsed: readElapsed,
  } = useElapsedTimer();
  const statusRef = useRef<VoiceRecorderStatus>('idle');
  const stopRef = useRef<() => Promise<VoiceStopResult>>(async () => ({ ok: false }));

  const setBoth = useCallback((next: VoiceRecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const resetAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    if (statusRef.current !== 'idle') return { ok: false, error: VOICE_ERRORS.failed };
    setBoth('starting');
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setBoth('idle');
        return { ok: false, error: VOICE_ERRORS.permissionDenied };
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      beginTimer(() => void stopRef.current().then(handleAutoStop));
      setBoth('recording');
      return { ok: true };
    } catch (err) {
      clearTimer();
      setBoth('idle');
      await resetAudioMode();
      return { ok: false, error: voiceErrorMessage(err) };
    }
  }, [beginTimer, clearTimer, handleAutoStop, recorder, resetAudioMode, setBoth]);

  const stop = useCallback(async (): Promise<VoiceStopResult> => {
    if (statusRef.current !== 'recording') return { ok: false };
    setBoth('stopping');
    const durationMs = Math.min(readElapsed(), VOICE_MAX_DURATION_MS);
    clearTimer();
    try {
      await recorder.stop();
    } catch (err) {
      deleteTempRecording(recorder.uri);
      setBoth('idle');
      await resetAudioMode();
      return { ok: false, error: voiceErrorMessage(err) };
    }
    await resetAudioMode();
    setBoth('idle');
    const uri = recorder.uri;
    if (!uri) return { ok: false, error: VOICE_ERRORS.failed };
    if (durationMs < VOICE_MIN_DURATION_MS) {
      deleteTempRecording(uri);
      return { ok: false, error: VOICE_ERRORS.tooShort };
    }
    return {
      ok: true,
      recording: {
        uri,
        mimeType: 'audio/mp4',
        durationMs,
        sizeBytes: tempRecordingSize(uri),
        dispose: onceCleanup(() => {
          deleteTempRecording(uri);
        }),
      },
    };
  }, [clearTimer, readElapsed, recorder, resetAudioMode, setBoth]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const cancel = useCallback(async () => {
    if (statusRef.current !== 'recording' && statusRef.current !== 'starting') return;
    clearTimer();
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    // Cancelled recordings are never sent: remove the temp file now.
    deleteTempRecording(recorder.uri);
    await resetAudioMode();
    setElapsedMs(0);
    setBoth('idle');
  }, [clearTimer, recorder, resetAudioMode, setBoth, setElapsedMs]);

  // Leaving the screen mid-recording: stop and delete the partial file.
  useEffect(
    () => () => {
      if (statusRef.current !== 'recording' && statusRef.current !== 'stopping') return;
      statusRef.current = 'idle';
      void (async () => {
        try {
          await recorder.stop();
        } catch {
          /* recorder may already be released */
        }
        try {
          deleteTempRecording(recorder.uri);
        } catch {
          /* ignore */
        }
      })();
    },
    [recorder],
  );

  return { status, durationMs: elapsedMs, start, stop, cancel };
}

type WebRecorderRefs = {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  mime: string;
};

function useWebVoiceRecorder(options?: VoiceRecorderOptions): VoiceRecorderApi {
  const handleAutoStop = useAutoStopHandler(options);
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const {
    durationMs: elapsedMs,
    setDurationMs: setElapsedMs,
    begin: beginTimer,
    clear: clearTimer,
    elapsed: readElapsed,
  } = useElapsedTimer();
  const statusRef = useRef<VoiceRecorderStatus>('idle');
  const refs = useRef<WebRecorderRefs>({ recorder: null, stream: null, chunks: [], mime: '' });
  const stopRef = useRef<() => Promise<VoiceStopResult>>(async () => ({ ok: false }));

  const setBoth = useCallback((next: VoiceRecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const releaseStream = useCallback(() => {
    refs.current.stream?.getTracks().forEach((t) => t.stop());
    refs.current.stream = null;
    refs.current.recorder = null;
  }, []);

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    if (statusRef.current !== 'idle') return { ok: false, error: VOICE_ERRORS.failed };
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const MR = typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder;
    const support = detectWebVoiceSupport({
      hasGetUserMedia: typeof nav?.mediaDevices?.getUserMedia === 'function',
      MediaRecorder: MR,
    });
    if (!support.supported || !MR || !nav) {
      return { ok: false, error: VOICE_ERRORS.unsupported };
    }
    setBoth('starting');
    try {
      const stream = await nav.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      refs.current.stream = stream;
      const mime = support.mimeType;
      let recorder: MediaRecorder;
      try {
        recorder = new MR(stream, {
          ...(mime ? { mimeType: mime } : {}),
          audioBitsPerSecond: 64_000,
        });
      } catch {
        // Some engines (older Safari) reject the options: use their default.
        recorder = new MR(stream);
      }
      const uploadMime = normalizeVoiceUploadMime(recorder.mimeType || mime || 'audio/webm');
      if (!uploadMime) {
        releaseStream();
        setBoth('idle');
        return { ok: false, error: VOICE_ERRORS.unsupported };
      }
      refs.current = { recorder, stream, chunks: [], mime: uploadMime };
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) refs.current.chunks.push(e.data);
      };
      recorder.start(250);
      beginTimer(() => void stopRef.current().then(handleAutoStop));
      setBoth('recording');
      return { ok: true };
    } catch (err) {
      releaseStream();
      clearTimer();
      setBoth('idle');
      return { ok: false, error: voiceErrorMessage(err) };
    }
  }, [beginTimer, clearTimer, handleAutoStop, releaseStream, setBoth]);

  const stop = useCallback(async (): Promise<VoiceStopResult> => {
    const rec = refs.current.recorder;
    if (statusRef.current !== 'recording' || !rec) return { ok: false };
    setBoth('stopping');
    const durationMs = Math.min(readElapsed(), VOICE_MAX_DURATION_MS);
    clearTimer();
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    // Final container type (Safari only reports it reliably after recording).
    const mimeType =
      normalizeVoiceUploadMime(rec.mimeType) ?? normalizeVoiceUploadMime(refs.current.mime) ?? 'audio/webm';
    const blob = new Blob(refs.current.chunks, { type: mimeType });
    refs.current.chunks = [];
    releaseStream();
    setBoth('idle');
    if (durationMs < VOICE_MIN_DURATION_MS || blob.size === 0) {
      return { ok: false, error: VOICE_ERRORS.tooShort };
    }
    const uri = URL.createObjectURL(blob);
    return {
      ok: true,
      recording: {
        uri,
        mimeType,
        durationMs,
        sizeBytes: blob.size,
        dispose: onceCleanup(() => URL.revokeObjectURL(uri)),
      },
    };
  }, [clearTimer, readElapsed, releaseStream, setBoth]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const cancel = useCallback(async () => {
    const rec = refs.current.recorder;
    clearTimer();
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    refs.current.chunks = [];
    releaseStream();
    setElapsedMs(0);
    setBoth('idle');
  }, [clearTimer, releaseStream, setBoth, setElapsedMs]);

  useEffect(() => releaseStream, [releaseStream]);

  return { status, durationMs: elapsedMs, start, stop, cancel };
}

/** Platform is fixed per bundle, so the chosen hook is stable across renders. */
export const useVoiceRecorder: (options?: VoiceRecorderOptions) => VoiceRecorderApi =
  Platform.OS === 'web' ? useWebVoiceRecorder : useNativeVoiceRecorder;
