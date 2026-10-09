import type { SupportTicketStatus } from '@/services/support';

/**
 * «بلاغاتي» — pure helpers (no React) so they stay unit-testable.
 * The list comes from GET /api/support/reports (own REPORT + FRAUD tickets).
 */

export const MY_REPORTS_ROUTE = '/support/reports';

export type ReportState = 'open' | 'review' | 'closed';

export const REPORT_STATE_LABEL_AR: Record<ReportState, string> = {
  open: 'مفتوح',
  review: 'قيد المراجعة',
  closed: 'مغلق',
};

/** Mirrors backend REPORT_STATE_STATUSES (support-tickets.service.ts). */
export function reportStateFor(status: SupportTicketStatus | string): ReportState {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'closed';
    case 'IN_REVIEW':
    case 'AI_ASSISTING':
    case 'WAITING_FOR_SUPPORT':
    case 'IN_PROGRESS':
      return 'review';
    default:
      return 'open';
  }
}

export const REPORT_TARGET_LABEL_AR: Record<string, string> = {
  listing: 'إعلان',
  post: 'منشور',
  user: 'حساب',
  story: 'قصة',
  collection: 'مجموعة',
  council_image: 'صورة في مجلس',
};

/** Row subtitle: «بلاغ على إعلان» / «بلاغ احتيال» / «بلاغ». */
export function reportKindLabelAr(kind: 'REPORT' | 'FRAUD', targetType?: string | null): string {
  if (kind === 'FRAUD') return 'بلاغ احتيال';
  const target = targetType ? REPORT_TARGET_LABEL_AR[targetType] : undefined;
  return target ? `بلاغ على ${target}` : 'بلاغ';
}
