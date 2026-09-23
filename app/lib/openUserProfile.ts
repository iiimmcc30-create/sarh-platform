import type { Router } from 'expo-router';
import { safePush } from '@/lib/safeNavigate';

export function openUserProfile(router: Router, userId?: string | null) {
  if (!userId) return;
  safePush({ pathname: '/users/[id]', params: { id: userId } }, undefined, router);
}
