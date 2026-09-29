/**
 * Native temp voice-recording helpers (expo-file-system `File` API).
 * Web uses `voiceTempFile.web.ts` (object URLs, nothing on disk).
 * Every helper swallows errors: cleanup must never break messaging.
 */
import { File } from 'expo-file-system';

/** Only app-local `file://` recordings are ever deleted. */
export function isDeletableTempUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.startsWith('file://');
}

/** Delete a finished/cancelled recording. Returns true when a file was removed. */
export function deleteTempRecording(uri: string | null | undefined): boolean {
  if (!isDeletableTempUri(uri)) return false;
  try {
    const file = new File(uri);
    if (!file.exists) return false;
    file.delete();
    return true;
  } catch {
    return false;
  }
}

/** Size in bytes of a local recording (enables the client-side 10 MB check). */
export function tempRecordingSize(uri: string | null | undefined): number | undefined {
  if (!isDeletableTempUri(uri)) return undefined;
  try {
    const file = new File(uri);
    return file.exists && typeof file.size === 'number' ? file.size : undefined;
  } catch {
    return undefined;
  }
}
