export async function parseApiError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (typeof json.messageAr === 'string' && json.messageAr.trim()) {
      return json.messageAr.trim();
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim();
    }
    if (Array.isArray(json.message)) {
      return json.message.join('، ');
    }
    if (typeof json.error === 'string' && json.error.trim()) {
      return json.error.trim();
    }
  } catch {
    // ignore parse errors
  }
  if (res.status === 404) {
    return 'المسار غير موجود على الخادم — تأكد من تحديث Backend';
  }
  return 'حدث خطأ، يرجى المحاولة مجدداً';
}

/** @deprecated Use parseApiError — kept for callers that pass a raw string. */
export function sanitizeApiMessage(
  message: string | undefined | null,
  fallback = 'حدث خطأ، يرجى المحاولة مجدداً',
): string {
  const trimmed = (message ?? '').trim();
  return trimmed || fallback;
}
