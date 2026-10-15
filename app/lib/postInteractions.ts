// lib/postInteractions.ts — shared post action handlers for feed screens

import { Share } from 'react-native';
import { Router } from 'expo-router';
import { Post, User } from '@/services/types';
import { promptReport } from '@/services/reports';
import { copyToClipboard } from '@/lib/clipboard';
import { showToast } from '@/lib/toast';
import { SARH_OFFICIAL_SITE } from '@/constants/sarhOfficial';
import {
  alertMessage,
  confirmDestructive,
  presentActionSheet,
} from '@/lib/actionSheet';

export function postShareUrl(postId: string): string {
  return `${SARH_OFFICIAL_SITE}/post/${encodeURIComponent(postId)}`;
}

export type DeletePostResult = { ok: boolean; error?: string };

export function requireAuth(isAuthenticated: boolean, action: string): boolean {
  if (isAuthenticated) return true;
  void alertMessage('تسجيل الدخول', `يجب تسجيل الدخول لـ${action}`);
  return false;
}

export async function sharePost(post: Post) {
  const url = postShareUrl(post.id);
  try {
    await Share.share({
      message: `${post.arabicContent}\n\n${url}\n\n— ${post.author.arabicName} (@${post.author.username}) عبر تطبيق سرح`,
      url,
      title: 'مشاركة منشور',
    });
  } catch {
    // dismissed
  }
}

export async function showPostMenu(
  post: Post,
  me: User,
  router: Router,
  deletePost: (id: string) => Promise<boolean | DeletePostResult>,
  isAuthenticated = true,
) {
  const isOwner = !!me.id && post.author?.id === me.id;
  const text = (post.arabicContent || post.content || '').trim();
  // Shared by the ⋯ button and long-press on a post / reply (iOS-style context menu).
  const common = [
    ...(text ? [{ key: 'copy', label: 'نسخ النص' }] : []),
    { key: 'copy-link', label: 'نسخ الرابط' },
    { key: 'share', label: 'مشاركة' },
  ];

  if (!isOwner) {
    const key = await presentActionSheet({
      title: 'المنشور',
      items: [
        ...common,
        { key: 'report', label: 'إبلاغ', destructive: true },
        { key: 'cancel', label: 'إغلاق', cancel: true },
      ],
    });
    if (await handleCommonPostAction(key, post, text)) return;
    if (key === 'report') {
      await promptReport('post', post.id, isAuthenticated);
    }
    return;
  }

  const key = await presentActionSheet({
    title: 'إدارة المنشور',
    items: [
      ...common,
      { key: 'edit', label: 'تعديل' },
      { key: 'delete', label: 'حذف', destructive: true },
      { key: 'cancel', label: 'إلغاء', cancel: true },
    ],
  });
  if (await handleCommonPostAction(key, post, text)) return;

  if (key === 'edit') {
    router.push({ pathname: '/create/post', params: { editId: post.id } });
    return;
  }

  if (key === 'delete') {
    const confirmed = await confirmDestructive(
      'حذف المنشور',
      'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.',
    );
    if (!confirmed) return;
    const result = await deletePost(post.id);
    const ok = typeof result === 'boolean' ? result : result.ok;
    const error = typeof result === 'boolean' ? undefined : result.error;
    if (!ok) {
      await alertMessage('خطأ', error || 'فشل حذف المنشور');
    }
  }
}

async function handleCommonPostAction(
  key: string | null | undefined,
  post: Post,
  text: string,
): Promise<boolean> {
  if (key === 'copy') {
    copyToClipboard(text);
    void showToast('تم نسخ النص', 'success');
    return true;
  }
  if (key === 'copy-link') {
    copyToClipboard(postShareUrl(post.id));
    void showToast('تم نسخ الرابط', 'success');
    return true;
  }
  if (key === 'share') {
    await sharePost(post);
    return true;
  }
  return false;
}
