import type { Router } from 'expo-router';
import { safePush } from '@/lib/safeNavigate';

function buildPostHref(postId: string, focusComment?: boolean): `/post/${string}` {
  const id = encodeURIComponent(postId.trim());
  return focusComment
    ? (`/post/${id}?focusComment=1` as `/post/${string}`)
    : (`/post/${id}` as `/post/${string}`);
}

export function openPostDetail(
  router: Router,
  postId: string,
  opts?: { focusComment?: boolean },
) {
  const id = String(postId ?? '').trim();
  if (!id) {
    if (__DEV__) console.warn('[openPostDetail] missing post id');
    return;
  }

  safePush(buildPostHref(id, opts?.focusComment), undefined, router);
}

export function postDetailHref(postId: string, focusComment?: boolean): `/post/${string}` {
  const id = String(postId ?? '').trim();
  return buildPostHref(id, focusComment);
}
