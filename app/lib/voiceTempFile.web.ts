/** Web: recordings are in-memory Blobs (object URLs revoked by the recorder). */
export function isDeletableTempUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.startsWith('file://');
}

export function deleteTempRecording(_uri: string | null | undefined): boolean {
  return false;
}

export function tempRecordingSize(_uri: string | null | undefined): number | undefined {
  return undefined;
}
