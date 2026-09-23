import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { authFetch } from '@/services/authFetch';

export type CommentDeleteResult =
  | { ok: true }
  | { ok: false; message: string };

async function deleteCommentRequest(url: string): Promise<CommentDeleteResult> {
  try {
    const res = await authFetch(url, { method: 'DELETE' });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.ok && json.success !== false) {
      return { ok: true };
    }

    if (res.status === 401) {
      return { ok: false, message: 'يجب تسجيل الدخول' };
    }

    if (res.status === 403) {
      return {
        ok: false,
        message:
          (typeof json.messageAr === 'string' && json.messageAr.trim()) ||
          'غير مسموح لك بحذف هذا التعليق',
      };
    }

    const message = await parseApiError(
      new Response(JSON.stringify(json), { status: res.status }),
    );
    return { ok: false, message };
  } catch {
    return { ok: false, message: 'تعذّر الاتصال بالخادم' };
  }
}

export async function deletePostComment(
  postId: string,
  commentId: string,
): Promise<CommentDeleteResult> {
  if (!postId?.trim() || !commentId?.trim()) {
    return { ok: false, message: 'معرّف التعليق غير صالح' };
  }
  return deleteCommentRequest(
    `${API_BASE}/api/posts/${encodeURIComponent(postId.trim())}/comments/${encodeURIComponent(commentId.trim())}`,
  );
}

export async function deleteListingComment(
  listingId: string,
  commentId: string,
): Promise<CommentDeleteResult> {
  if (!listingId?.trim() || !commentId?.trim()) {
    return { ok: false, message: 'معرّف التعليق غير صالح' };
  }
  return deleteCommentRequest(
    `${API_BASE}/api/listings/${encodeURIComponent(listingId.trim())}/comments/${encodeURIComponent(commentId.trim())}`,
  );
}
