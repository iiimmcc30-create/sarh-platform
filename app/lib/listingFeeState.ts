/**
 * «سداد الرسوم» state for a listing, from the fee summary the listing detail API
 * already returns (`fee: { id, status, commission, dueDate, saleAmount } | null`).
 *
 * - no fee row (legacy listing) → still payable: the server creates the row on quote/pay.
 * - pending (or legacy overdue) → payable, voluntarily (العمولة اختيارية وعلى الأمانة).
 * - paid → show «الرسوم مسددة ✓» instead of the button.
 * - waived → nothing to pay; hide the button.
 */
export type ListingFeeStatus = 'pending' | 'overdue' | 'paid' | 'waived';

export type ListingFeeSummary = {
  id?: string;
  status: ListingFeeStatus | string;
};

export type ListingFeeButtonState = 'pay' | 'paid' | 'none';

export function normalizeListingFee(raw: unknown): ListingFeeSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const status = (raw as { status?: unknown }).status;
  if (typeof status !== 'string' || !status) return null;
  const id = (raw as { id?: unknown }).id;
  return { ...(typeof id === 'string' ? { id } : {}), status };
}

export function listingFeeButtonState(
  fee: ListingFeeSummary | null | undefined,
): ListingFeeButtonState {
  if (!fee) return 'pay';
  if (fee.status === 'paid') return 'paid';
  if (fee.status === 'waived') return 'none';
  return 'pay';
}

export function canPayListingFee(state: ListingFeeButtonState): boolean {
  return state === 'pay';
}

export const LISTING_FEE_PAID_LABEL = 'الرسوم مسددة ✓';

export const LISTING_FEE_MESSAGES = {
  alreadyPaid: 'تم سداد رسوم هذا الإعلان مسبقاً، لا يلزمك أي إجراء.',
  notApplicable: 'لا تنطبق رسوم سرح على هذا الإعلان.',
  disabled: 'سداد رسوم الإعلانات غير متاح حالياً.',
  quoteRetry: 'تعذّر حساب الرسوم الآن. حاول مرة أخرى.',
  payRetry: 'تعذّر بدء عملية الدفع. حاول مرة أخرى.',
  network: 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى.',
} as const;

export type ListingFeeErrorKind = 'already_paid' | 'not_applicable' | 'validation' | 'retry';

/** Server error code → what the sheet should do. */
export function listingFeeErrorKind(code: string | undefined): ListingFeeErrorKind {
  switch (code) {
    case 'fee_already_paid':
      return 'already_paid';
    case 'fee_not_applicable':
    case 'fee_not_found':
    case 'listing_deleted':
    case 'service_disabled':
      return 'not_applicable';
    case 'invalid_sale_amount':
    case 'amount_mismatch':
      return 'validation';
    default:
      return 'retry';
  }
}

/**
 * Clear Arabic copy for a failed quote/initiate. Never surfaces the raw
 * «لا توجد رسوم…» text; validation errors keep the server's own wording.
 */
export function listingFeeErrorMessage(
  code: string | undefined,
  serverMessage: string | undefined,
  stage: 'quote' | 'pay',
): string {
  const kind = listingFeeErrorKind(code);
  if (kind === 'already_paid') return LISTING_FEE_MESSAGES.alreadyPaid;
  if (kind === 'not_applicable') {
    return code === 'service_disabled'
      ? LISTING_FEE_MESSAGES.disabled
      : LISTING_FEE_MESSAGES.notApplicable;
  }
  if (kind === 'validation' && serverMessage) return serverMessage;
  if (code === 'network') return LISTING_FEE_MESSAGES.network;
  return stage === 'quote' ? LISTING_FEE_MESSAGES.quoteRetry : LISTING_FEE_MESSAGES.payRetry;
}

/** Row of GET /api/fees («سداد الرسوم»). */
export type FeeListRow = {
  id: string;
  listingId: string;
  /** Null until the seller enters the sale amount (1% of the sale, never the asking price). */
  commission: number | null;
  saleAmount?: number | null;
  status: string;
  /** Server flag: declared sold / sale amount entered and not paid yet. */
  owed?: boolean;
  listing: { arabicTitle: string; sellerDeclaredSold?: boolean | null } | null;
};

/**
 * Commission is due only when the livestock is actually sold, and paying it is
 * optional (على الأمانة). Show paid fees and fees the seller declared as sold
 * (or entered a sale amount for); never unsold / hidden / deleted listings and
 * never an «متأخرة» state. Older servers send every fee, so filter here too.
 */
export function visibleFees(rows: FeeListRow[]): FeeListRow[] {
  return rows.filter((fee) => {
    if (fee.status === 'paid') return true;
    if (fee.status !== 'pending' && fee.status !== 'overdue') return false;
    if (typeof fee.owed === 'boolean') return fee.owed;
    return fee.saleAmount != null || fee.listing?.sellerDeclaredSold === true;
  });
}

