export type DocumentPreviewKind = 'image' | 'pdf' | 'other';

export function documentPreviewKind(
  mimeType: unknown,
  fileName?: unknown,
): DocumentPreviewKind {
  const mime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  const name = typeof fileName === 'string' ? fileName.toLowerCase() : '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}

export function documentFileUrl(doc: Record<string, unknown>): string {
  return doc.fileUrl ? String(doc.fileUrl) : '';
}

export function isSensitiveCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('password') ||
    normalized.includes('passwordhash') ||
    normalized === 'accounthash'
  );
}
