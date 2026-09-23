import { isCompletedSale } from './sales.util';

describe('isCompletedSale', () => {
  it('does not count unpaid orders', () => {
    expect(
      isCompletedSale({ paymentStatus: 'unpaid', status: 'pending' }),
    ).toBe(false);
  });

  it('does not count cancelled orders even if previously paid', () => {
    expect(
      isCompletedSale({ paymentStatus: 'paid', status: 'cancelled' }),
    ).toBe(false);
  });

  it('counts paid delivered orders', () => {
    expect(
      isCompletedSale({ paymentStatus: 'paid', status: 'delivered' }),
    ).toBe(true);
  });

  it('counts paid in-progress orders (preparing)', () => {
    expect(
      isCompletedSale({ paymentStatus: 'paid', status: 'preparing' }),
    ).toBe(true);
  });

  it('does not count failed or refunded payments', () => {
    expect(
      isCompletedSale({ paymentStatus: 'failed', status: 'pending' }),
    ).toBe(false);
    expect(
      isCompletedSale({ paymentStatus: 'refunded', status: 'delivered' }),
    ).toBe(false);
  });
});
