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
  baseMime,
  pickWebVoiceMime,
  voiceErrorMessage,
} from '@/lib/voiceRecording';

export type VoiceRecording = {
  uri: string;
  mimeType: string;
  durationMs: number;
  sizeBytes?: number;
  /** Release temp resources (web object URL). Safe to call more than once. */
  dispose: () => void;
};

export type VoiceRecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping';

export type VoiceStartResult = { ok: true } | { ok: false; error: string };
export type VoiceStopResult =
  | { ok: true; recording: VoiceRecording }
  | { ok: false; error?: string };

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

function useNativeVoiceRecorder(): VoiceRecorderApi {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
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
      beginTimer(() => void stopRef.current());
      setBoth('recording');
      return { ok: true };
    } catch (err) {
      clearTimer();
      setBoth('idle');
      await resetAudioMode();
      return { ok: false, error: voiceErrorMessage(err) };
    }
  }, [beginTimer, clearTimer, recorder, resetAudioMode, setBoth]);

  const stop = useCallback(async (): Promise<VoiceStopResult> => {
    if (statusRef.current !== 'recording') return { ok: false };
    setBoth('stopping');
    const durationMs = Math.min(readElapsed(), VOICE_MAX_DURATION_MS);
    clearTimer();
    try {
      await recorder.stop();
    } catch (err) {
      setBoth('idle');
      await resetAudioMode();
      return { ok: false, error: voiceErrorMessage(err) };
    }
    await resetAudioMode();
    setBoth('idle');
    const uri = recorder.uri;
    if (!uri) return { ok: false, error: VOICE_ERRORS.failed };
    if (durationMs < VOICE_MIN_DURATION_MS) return { ok: false, error: VOICE_ERRORS.tooShort };
    return {
      ok: true,
      recording: { uri, mimeType: 'audio/mp4', durationMs, dispose: () => undefined },
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
    await resetAudioMode();
    setElapsedMs(0);
    setBoth('idle');
  }, [clearTimer, recorder, resetAudioMode, setBoth, setElapsedMs]);

  return { status, durationMs: elapsedMs, start, stop, cancel };
}

type WebRecorderRefs = {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  mime: string;
};

function useWebVoiceRecorder(): VoiceRecorderApi {
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
    if (!nav?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return { ok: false, error: VOICE_ERRORS.unsupported };
    }
    setBoth('starting');
    try {
      const stream = await nav.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const mime = pickWebVoiceMime(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
      const recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 64_000,
      });
      refs.current = { recorder, stream, chunks: [], mime: recorder.mimeType || mime || 'audio/webm' };
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) refs.current.chunks.push(e.data);
      };
      recorder.start(250);
      beginTimer(() => void stopRef.current());
      setBoth('recording');
      return { ok: true };
    } catch (err) {
      releaseStream();
      clearTimer();
      setBoth('idle');
      return { ok: false, error: voiceErrorMessage(err) };
    }
  }, [beginTimer, clearTimer, releaseStream, setBoth]);

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
    const mimeType = baseMime(refs.current.mime) || 'audio/webm';
    const blob = new Blob(refs.current.chunks, { type: mimeType });
    refs.current.chunks = [];
    releaseStream();
    setBoth('idle');
    if (durationMs < VOICE_MIN_DURATION_MS || blob.size === 0) {
      return { ok: false, error: VOICE_ERRORS.tooShort };
    }
    const uri = URL.createObjectURL(blob);
    let disposed = false;
    return {
      ok: true,
      recording: {
        uri,
        mimeType,
        durationMs,
        sizeBytes: blob.size,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          URL.revokeObjectURL(uri);
        },
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
export const useVoiceRecorder: () => VoiceRecorderApi =
  Platform.OS === 'web' ? useWebVoiceRecorder : useNativeVoiceRecorder;
