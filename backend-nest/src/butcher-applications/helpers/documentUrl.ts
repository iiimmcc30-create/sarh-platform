import { getStoredObjectUrl } from '@/lib/storage';

export async function resolveAdminDocumentFileUrl(
  fileKey: string | null | undefined,
  mimeType: string | null | undefined,
): Promise<string | null> {
  if (!fileKey) return null;
  const url = await getStoredObjectUrl(fileKey, mimeType);
  return url || null;
}

export function documentPreviewKind(
  mimeType: string | null | undefined,
  fileName?: string | null,
): 'image' | 'pdf' | 'other' {
  const mime = (mimeType ?? '').toLowerCase();
  const name = (fileName ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}
