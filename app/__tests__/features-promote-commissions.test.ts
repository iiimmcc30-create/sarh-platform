import {
  calculateCommission,
  formatDueDate,
  getFeesSummary,
  isStoreExempt,
  type PendingFee,
} from '@/services/commissions';
import {
  buildPromoteCheckoutPayload,
  clampPromoteAmount,
  clampPromoteDurationHours,
  computeBoostPrice,
  computeVisibilityMinPrice,
  estimatePromotionReach,
  goalFromBoostType,
  parsePromoteAmountInput,
  parsePromoteDurationInput,
  resolvePromoteAmount,
  validatePromoteForm,
} from '@/services/listingPromote';

describe('commissions', () => {
  it('treats all listings as 1% listing commission', () => {
    const result = calculateCommission('sheep', 1000, 3);
    expect(result.commission).toBe(10);
    expect(result.isExempt).toBe(false);
    expect(result.netAfterCommission).toBe(990);
  });

  it('charges 1% listing commission even if a plan stores a legacy 5', () => {
    const charged = calculateCommission('store', 1000);
    expect(charged.isExempt).toBe(false);
    expect(charged.commission).toBe(10);
    expect(charged.netAfterCommission).toBe(990);
    expect(isStoreExempt({ storeCommission: 0 })).toBe(true);
    expect(isStoreExempt({ storeCommission: 5 })).toBe(false);
  });

  it('summarizes pending/overdue/paid fees', () => {
    const fees: PendingFee[] = [
      {
        id: '1',
        listingId: 'l1',
        listingTitleAr: 'أ',
        category: 'store',
        icon: '🏪',
        quantity: 1,
        price: 100,
        commission: 10,
        status: 'pending',
        dueDate: '2099-01-01',
      },
      {
        id: '2',
        listingId: 'l2',
        listingTitleAr: 'ب',
        category: 'store',
        icon: '🏪',
        quantity: 1,
        price: 100,
        commission: 20,
        status: 'overdue',
        dueDate: '2020-01-01',
      },
      {
        id: '3',
        listingId: 'l3',
        listingTitleAr: 'ج',
        category: 'store',
        icon: '🏪',
        quantity: 1,
        price: 100,
        commission: 30,
        status: 'paid',
        dueDate: '2099-01-01',
        paidAt: '2099-01-02',
      },
    ];
    expect(getFeesSummary(fees)).toEqual({
      totalPending: 10,
      totalOverdue: 20,
      totalPaid: 30,
      pendingCount: 1,
      overdueCount: 1,
      paidCount: 1,
    });
  });

  it('formats due dates with urgency flags', () => {
    const overdue = formatDueDate(new Date(Date.now() - 2 * 864e5).toISOString());
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.urgent).toBe(true);

    const far = formatDueDate(new Date(Date.now() + 10 * 864e5).toISOString());
    expect(far.isOverdue).toBe(false);
    expect(far.urgent).toBe(false);
  });
});

describe('listingPromote', () => {
  it('computes boost and visibility prices from the official catalog', () => {
    expect(computeBoostPrice('featured', 24)).toBe(9);
    expect(computeBoostPrice('featured', 72)).toBe(25);
    expect(computeBoostPrice('pinned', 24)).toBe(12);
    expect(computeBoostPrice('pinned', 72)).toBe(29);
    expect(computeBoostPrice('featured', 12)).toBe(0);
    expect(computeVisibilityMinPrice(24)).toBe(19);
    expect(computeVisibilityMinPrice(48)).toBe(35);
    expect(computeVisibilityMinPrice(1)).toBe(0);
  });

  it('clamps and parses amount/duration inputs', () => {
    expect(clampPromoteAmount(1)).toBe(9);
    expect(clampPromoteAmount(9)).toBe(9);
    expect(clampPromoteAmount(999)).toBe(500);
    expect(clampPromoteDurationHours(0)).toBe(1);
    expect(clampPromoteDurationHours(999)).toBe(168);
    expect(parsePromoteAmountInput('abc')).toBeNull();
    expect(parsePromoteAmountInput('25 ريال')).toBe(25);
    expect(parsePromoteDurationInput('6h')).toBe(6);
  });

  it('estimates reach and resolves amount by goal', () => {
    const reach = estimatePromotionReach(20, 6);
    expect(reach.max).toBeGreaterThan(reach.min);
    expect(resolvePromoteAmount('visibility', 24, 5)).toBe(19);
    expect(resolvePromoteAmount('visibility', 24, 999)).toBe(19);
    expect(resolvePromoteAmount('pinned', 72, 999)).toBe(computeBoostPrice('pinned', 72));
    expect(resolvePromoteAmount('pinned', 12, 999)).toBe(0);
  });

  it('validates form and builds checkout payload', () => {
    expect(validatePromoteForm(null, 20, 6)).toMatch(/هدف/);
    expect(validatePromoteForm('visibility', 5, 6)).toMatch(/مدة/);
    expect(validatePromoteForm('visibility', 999, 24)).toBeNull();

    const payload = buildPromoteCheckoutPayload('ad-1', 'visibility', 24);
    expect(payload?.adId).toBe('ad-1');
    expect(payload?.promotionGoal).toBe('visibility');
    expect(payload?.promotionDurationHours).toBe(24);
    expect(payload?.promotionAmount).toBe(19);
    expect(payload?.reachEstimate).toBeDefined();
    expect(payload).toBeTruthy();
    expect(new Date(payload!.endTime).getTime()).toBeGreaterThan(
      new Date(payload!.startTime).getTime(),
    );
  });

  it('maps boost types to promotion goals', () => {
    expect(goalFromBoostType('promotion')).toBe('visibility');
    expect(goalFromBoostType('visibility')).toBe('visibility');
    expect(goalFromBoostType('pinned')).toBe('pinned');
    expect(goalFromBoostType('featured')).toBe('featured');
    expect(goalFromBoostType('nope')).toBeNull();
  });
});
