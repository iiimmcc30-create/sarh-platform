import { readFileSync } from 'fs';
import path from 'path';
import {
  LISTING_FEE_MESSAGES,
  LISTING_FEE_PAID_LABEL,
  canPayListingFee,
  listingFeeButtonState,
  listingFeeErrorKind,
  listingFeeErrorMessage,
  normalizeListingFee,
} from '../lib/listingFeeState';

const read = (rel: string) =>
  readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('«سداد الرسوم» button state', () => {
  it('no fee row (legacy listing) is still payable — the server creates it', () => {
    expect(listingFeeButtonState(null)).toBe('pay');
    expect(listingFeeButtonState(undefined)).toBe('pay');
    expect(canPayListingFee(listingFeeButtonState(null))).toBe(true);
  });

  it('pending and overdue show the button', () => {
    expect(listingFeeButtonState({ status: 'pending' })).toBe('pay');
    expect(listingFeeButtonState({ status: 'overdue' })).toBe('pay');
  });

  it('paid shows «الرسوم مسددة ✓» instead of the button', () => {
    expect(listingFeeButtonState({ status: 'paid' })).toBe('paid');
    expect(canPayListingFee('paid')).toBe(false);
    expect(LISTING_FEE_PAID_LABEL).toBe('الرسوم مسددة ✓');
  });

  it('waived hides the button', () => {
    expect(listingFeeButtonState({ status: 'waived' })).toBe('none');
    expect(canPayListingFee('none')).toBe(false);
  });

  it('normalizes the detail API fee summary', () => {
    expect(normalizeListingFee(null)).toBeNull();
    expect(normalizeListingFee({})).toBeNull();
    expect(normalizeListingFee({ id: 'f1', status: 'paid', commission: 5 })).toEqual({
      id: 'f1',
      status: 'paid',
    });
  });
});

describe('fee sheet error messages', () => {
  it('already paid → paid state, never the raw «لا توجد رسوم»', () => {
    expect(listingFeeErrorKind('fee_already_paid')).toBe('already_paid');
    expect(listingFeeErrorMessage('fee_already_paid', 'x', 'quote')).toBe(
      LISTING_FEE_MESSAGES.alreadyPaid,
    );
  });

  it('admin listing / not found / deleted → not applicable', () => {
    for (const code of ['fee_not_applicable', 'fee_not_found', 'listing_deleted']) {
      expect(listingFeeErrorKind(code)).toBe('not_applicable');
      const msg = listingFeeErrorMessage(code, 'لا توجد رسوم إعلان مرتبطة بهذا الإعلان', 'quote');
      expect(msg).toBe(LISTING_FEE_MESSAGES.notApplicable);
      expect(msg).not.toContain('لا توجد رسوم');
    }
  });

  it('fees disabled → disabled copy', () => {
    expect(listingFeeErrorKind('service_disabled')).toBe('not_applicable');
    expect(listingFeeErrorMessage('service_disabled', undefined, 'pay')).toBe(
      LISTING_FEE_MESSAGES.disabled,
    );
  });

  it('validation keeps the server wording; everything else is a generic retry', () => {
    expect(listingFeeErrorMessage('invalid_sale_amount', 'أدخل مبلغ بيع صالحاً أكبر من صفر', 'quote')).toBe(
      'أدخل مبلغ بيع صالحاً أكبر من صفر',
    );
    expect(listingFeeErrorMessage('boom', 'raw', 'quote')).toBe(LISTING_FEE_MESSAGES.quoteRetry);
    expect(listingFeeErrorMessage(undefined, undefined, 'pay')).toBe(LISTING_FEE_MESSAGES.payRetry);
    expect(listingFeeErrorMessage('network', 'x', 'pay')).toBe(LISTING_FEE_MESSAGES.network);
  });
});

describe('wiring', () => {
  const sheet = read('components/listing/ListingFeePaymentSheet.tsx');
  const screen = read('app/listing/[id].tsx');
  const service = read('services/listingFeePayment.ts');

  it('sheet maps failures through the helper and has a paid state', () => {
    expect(sheet).toContain("showFailure(quoted, 'quote');");
    expect(sheet).toContain("showFailure(initiated, 'pay');");
    expect(sheet).toContain("if (kind === 'already_paid') {");
    expect(sheet).toContain('testID="fee-already-paid"');
    expect(sheet).not.toContain('setErrorMessage(quoted.message)');
    expect(sheet).not.toContain('setErrorMessage(initiated.message)');
  });

  it('service exposes the server error code', () => {
    expect(service.match(/code: typeof json\.error === "string" \? json\.error : undefined,/g)).toHaveLength(2);
  });

  it('detail screen gates «سداد الرسوم» on the listing fee state', () => {
    expect(screen).toContain('fee: normalizeListingFee(raw.fee),');
    expect(screen).toContain('const feeButtonState = listingFeeButtonState(listing.fee);');
    expect(screen).toContain('const ownerPrimaryAction = canPayListingFee(feeButtonState)');
    expect(screen).toContain("feeButtonState === 'paid' ? <ListingFeePaidBadge /> : null");
  });
});
