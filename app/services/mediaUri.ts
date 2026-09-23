/** True when the URI is a local/temporary file that must be uploaded before saving to the API */
export function needsUpload(uri?: string | null): uri is string {
  if (!uri) return false;
  if (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:')
  ) {
    return true;
  }
  return !/^https?:\/\//i.test(uri);
}
