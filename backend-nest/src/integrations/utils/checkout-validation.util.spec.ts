import 'reflect-metadata';
import {
  assertNiFetchUuid,
  assertNotInternalRefAsUuid,
  validateCheckoutCommand,
} from './checkout-validation.util';

describe('checkout UUID validation', () => {
  it('accepts NI UUID for fetch', () => {
    expect(() =>
      assertNiFetchUuid('a13f81f3-27b4-48b6-88de-22b9ddc1e1dc'),
    ).not.toThrow();
  });

  it('rejects internal merchant ref in UUID field', () => {
    expect(() => assertNiFetchUuid('FTR-4916FD-MSPXSTSH')).toThrow(
      /internal merchant reference/,
    );
    expect(() =>
      assertNotInternalRefAsUuid('FTR-4916FD-MSPXSTSH', 'externalOrderId'),
    ).toThrow(/must be an NI UUID/);
  });

  it('validates checkout command fields', () => {
    const errors = validateCheckoutCommand({
      paymentId: 'not-a-uuid',
      merchantOrderReference: 'FTR-4916FD-MSPXSTSH',
      amount: -1,
      description: 'x',
      redirectUrl: 'https://sarh.app/ok',
      cancelUrl: 'https://sarh.app/cancel',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
