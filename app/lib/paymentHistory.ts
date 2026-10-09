import type { PaymentRecord } from '@/services/userSettings';

/** Type icon + Arabic label per Payment.referenceType. */
export const PAYMENT_TYPE_COPY: Record<string, { icon: string; label: string }> = {
  subscription: { icon: 'shield-checkmark-outline', label: 'اشتراك' },
  fee: { icon: 'receipt-outline', label: 'رسوم' },
  listing_fee: { icon: 'receipt-outline', label: 'رسوم إعلان' },
  commission: { icon: 'receipt-outline', label: 'عمولة' },
  featured_ad: { icon: 'star-outline', label: 'إعلان مميز' },
  pinned_ad: { icon: 'pricetag-outline', label: 'تثبيت إعلان' },
  promoted_ad: { icon: 'megaphone-outline', label: 'ترويج إعلان' },
};

const FALLBACK_TYPE = { icon: 'card-outline', label: 'عملية دفع' };

export function paymentType(p: Pick<PaymentRecord, 'referenceType'>): { icon: string; label: string } {
  return (p.referenceType && PAYMENT_TYPE_COPY[p.referenceType]) || FALLBACK_TYPE;
}

export const PAYMENT_METHOD_AR: Record<string, string> = {
  mada: 'مدى',
  visa: 'Visa',
  mastercard: 'Mastercard',
  apple_pay: 'Apple Pay',
  stc_pay: 'STC Pay',
};

export type PaymentTone = 'neutral' | 'success' | 'warning' | 'danger';

export function paymentStatusTone(status: string): PaymentTone {
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

export function paymentTitle(p: PaymentRecord): string {
  return p.descriptionAr || p.description || paymentType(p).label;
}

export function formatPaymentAmount(p: Pick<PaymentRecord, 'amount' | 'currency'>): string {
  const n = Number.isFinite(p.amount) ? p.amount : 0;
  return `${n.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ${p.currency === 'SAR' ? 'ر.س' : p.currency}`;
}

function paymentDate(p: PaymentRecord): Date | null {
  const d = new Date(p.paidAt ?? p.createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Newest first, grouped by calendar month (key `YYYY-MM`, label like «أكتوبر 2026»). */
export function groupPaymentsByMonth(
  payments: PaymentRecord[],
): Array<{ key: string; label: string; items: PaymentRecord[] }> {
  const sorted = [...payments].sort(
    (a, b) => (paymentDate(b)?.getTime() ?? 0) - (paymentDate(a)?.getTime() ?? 0),
  );
  const groups: Array<{ key: string; label: string; items: PaymentRecord[] }> = [];
  for (const p of sorted) {
    const d = paymentDate(p);
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown';
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: d ? monthLabel(d) : 'بدون تاريخ', items: [] };
      groups.push(group);
    }
    group.items.push(p);
  }
  return groups;
}

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function monthLabel(d: Date): string {
  return `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatPaymentDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const period = hh < 12 ? 'ص' : 'م';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()} · ${h12}:${mm} ${period}`;
}

/** List → detail hand-off without refetching (detail page refetches when the cache is cold). */
let cache: PaymentRecord[] = [];
export function rememberPayments(list: PaymentRecord[]): void {
  cache = list;
}
export function findRememberedPayment(id: string): PaymentRecord | undefined {
  return cache.find((p) => p.id === id);
}
