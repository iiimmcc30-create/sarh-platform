import { readFileSync } from 'fs';
import path from 'path';
import { visibleFees, type FeeListRow } from '../lib/listingFeeState';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const fee = (over: Partial<FeeListRow>): FeeListRow => ({
  id: 'f',
  listingId: 'l',
  commission: 10,
  status: 'pending',
  listing: { arabicTitle: 'خروف', sellerDeclaredSold: null },
  ...over,
});

describe('«سداد الرسوم»: commission only when sold, optional, never overdue', () => {
  it('lists paid fees and declared-sold / sale-amount fees only', () => {
    const rows = [
      fee({ id: 'unsold' }),
      fee({ id: 'legacy-overdue-unsold', status: 'overdue' }),
      fee({ id: 'declared', listing: { arabicTitle: 'x', sellerDeclaredSold: true }, commission: null }),
      fee({ id: 'amount', saleAmount: 5000, commission: 50 }),
      fee({ id: 'paid', status: 'paid' }),
      fee({ id: 'waived', status: 'waived' }),
    ];
    expect(visibleFees(rows).map((r) => r.id)).toEqual(['declared', 'amount', 'paid']);
  });

  it('trusts the server `owed` flag when present', () => {
    expect(visibleFees([fee({ id: 'a', owed: false, saleAmount: 1 }), fee({ id: 'b', owed: true })]).map((r) => r.id)).toEqual(['b']);
  });

  it('page: no «متأخرة», no outstanding total for unsold listings, friendly empty state', () => {
    const page = src('app/fees.tsx');
    expect(page).not.toContain('متأخرة');
    expect(page).not.toContain('إجمالي الالتزام');
    expect(page).not.toContain('statusPillOverdue');
    expect(page).toContain('visibleFees(');
    expect(page).toContain('ما عليك رسوم مستحقة');
    expect(page).toContain('العمولة تُدفع فقط إذا بعت');
    expect(page).toContain('أدخل مبلغ البيع لحساب العمولة');
    // Voluntary pay path unchanged.
    expect(page).toContain('<ListingFeePaymentSheet');
    expect(page).toContain('onPress={() => setPayListingId(fee.listingId)}');
  });
});
