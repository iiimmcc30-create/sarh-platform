import type { Router } from 'expo-router';
import { safePush } from '@/lib/safeNavigate';

export type OpenPostOptions = {
  focusComment?: boolean;
  replyId?: string;
};

function buildPostHref(postId: string, opts?: OpenPostOptions): `/post/${string}` {
  const id = encodeURIComponent(postId.trim());
  const params = new URLSearchParams();
  if (opts?.focusComment) params.set('focusComment', '1');
  const replyId = opts?.replyId?.trim();
  if (replyId) params.set('replyId', replyId);
  const query = params.toString();
  return (query ? `/post/${id}?${query}` : `/post/${id}`) as `/post/${string}`;
}

export function openPostDetail(
  router: Router,
  postId: string,
  opts?: OpenPostOptions,
) {
  const id = String(postId ?? '').trim();
  if (!id) {
    if (__DEV__) console.warn('[openPostDetail] missing post id');
    return;
  }

  safePush(buildPostHref(id, opts), undefined, router);
}

export function postDetailHref(postId: string, focusComment?: boolean): `/post/${string}` {
  const id = String(postId ?? '').trim();
  return buildPostHref(id, { focusComment });
}
