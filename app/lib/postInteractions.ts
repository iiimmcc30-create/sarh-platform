// lib/postInteractions.ts — shared post action handlers for feed screens

import { Share } from 'react-native';
import { Router } from 'expo-router';
import { Post, User } from '@/services/types';
import { promptReport } from '@/services/reports';
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

  if (!isOwner) {
    const key = await presentActionSheet({
      title: 'المنشور',
      items: [
        { key: 'report', label: 'إبلاغ', destructive: true },
        { key: 'cancel', label: 'إغلاق', cancel: true },
      ],
    });
    if (key === 'report') {
      await promptReport('post', post.id, isAuthenticated);
    }
    return;
  }

  const key = await presentActionSheet({
    title: 'إدارة المنشور',
    items: [
      { key: 'edit', label: 'تعديل' },
      { key: 'delete', label: 'حذف', destructive: true },
      { key: 'cancel', label: 'إلغاء', cancel: true },
    ],
  });

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
