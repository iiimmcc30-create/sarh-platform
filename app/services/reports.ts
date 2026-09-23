import { authFetch } from '@/services/authFetch';
import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import {
  alertMessage,
  presentActionSheet,
} from '@/lib/actionSheet';

export type ReportTargetType = 'listing' | 'post' | 'user' | 'story';

const REASONS = [
  'محتوى غير لائق',
  'احتيال أو خداع',
  'سبام / إعلان مزعج',
  'انتحال شخصية',
  'أخرى',
];

export async function submitReport(params: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await parseApiError(res) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'فشل إرسال البلاغ',
    };
  }
}

/** Shows reason picker then submits a report. Works on web + native. */
export async function promptReport(
  targetType: ReportTargetType,
  targetId: string,
  isAuthenticated: boolean,
) {
  if (!isAuthenticated) {
    await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول للإبلاغ');
    return;
  }

  const key = await presentActionSheet({
    title: 'إبلاغ',
    message: 'اختر سبب البلاغ',
    items: [
      ...REASONS.map((reason, i) => ({
        key: `reason-${i}`,
        label: reason,
        destructive: true,
      })),
      { key: 'cancel', label: 'إلغاء', cancel: true },
    ],
  });

  if (!key || !key.startsWith('reason-')) return;
  const index = Number(key.replace('reason-', ''));
  const reason = REASONS[index];
  if (!reason) return;

  const result = await submitReport({ targetType, targetId, reason });
  if (result.ok) {
    await alertMessage('تم', 'تم إرسال البلاغ وسيتم مراجعته من فريق الدعم.');
  } else {
    await alertMessage('خطأ', result.error || 'فشل إرسال البلاغ');
  }
}
