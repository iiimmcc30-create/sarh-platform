import { formatCalendarDateAr } from '@/lib/formatDateTime';

export function profileNameHint(nextAllowedAt?: string | null): string {
  if (nextAllowedAt) {
    return `يمكنك تغيير اسمك مرة أخرى في ${formatCalendarDateAr(nextAllowedAt)}.`;
  }
  return 'يمكنك تغيير اسمك مرة واحدة كل 7 أيام.';
}

export function profileUsernameHint(nextAllowedAt?: string | null): string {
  if (nextAllowedAt) {
    return `يمكنك تغيير اسم المستخدم مرة أخرى في ${formatCalendarDateAr(nextAllowedAt)}.`;
  }
  return 'يمكنك تغيير اسم المستخدم مرة واحدة كل 30 يومًا.';
}
