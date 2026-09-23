import {
  classifyNiOrderState,
  extractNiOrderReference,
  formatNiGatewayError,
  isInternalMerchantOrderReference,
  isNiOrderUuid,
  NiGatewayError,
  niOrderStateLabelAr,
  resolveNiOrderState,
  extractNiPaymentStates,
} from './ni-client';

describe('NI payment state classification', () => {
  describe('classifyNiOrderState — success', () => {
    it.each([
      'CAPTURED',
      'PURCHASED',
      'PAID',
      'SUCCESS',
      'captured',
      'Purchased',
    ])('treats %s as success', (state) => {
      expect(classifyNiOrderState(state)).toBe('success');
    });
  });

  describe('classifyNiOrderState — failed / cancelled / expired', () => {
    it.each([
      'FAILED',
      'DECLINED',
      'CANCELLED',
      'EXPIRED',
      'REVERSED',
      'CLOSED',
      'cancelled',
      'expired',
    ])('treats %s as failed', (state) => {
      expect(classifyNiOrderState(state)).toBe('failed');
    });
  });

  describe('classifyNiOrderState — processing / edge', () => {
    it.each(['STARTED', 'PENDING', 'AUTHORISED', 'AUTHORIZED', '', 'UNKNOWN'])(
      'treats %s as processing',
      (state) => {
        expect(classifyNiOrderState(state)).toBe('processing');
      },
    );
  });

  describe('niOrderStateLabelAr', () => {
    it('returns Arabic labels for each outcome', () => {
      expect(niOrderStateLabelAr('success')).toContain('نجاح');
      expect(niOrderStateLabelAr('failed')).toContain('فشل');
      expect(niOrderStateLabelAr('processing')).toContain('معالجة');
    });
  });

  describe('resolveNiOrderState', () => {
    it('prefers nested payment state over order state when present', () => {
      const order = {
        state: 'STARTED',
        _embedded: {
          payment: [{ state: 'CAPTURED' }],
        },
      };
      expect(resolveNiOrderState(order)).toBe('CAPTURED');
    });

    it('falls back to order.state', () => {
      expect(resolveNiOrderState({ state: 'FAILED' })).toBe('FAILED');
    });

    it('returns empty string for empty order', () => {
      expect(resolveNiOrderState({})).toBe('');
    });
  });

  describe('extractNiPaymentStates', () => {
    it('collects payment states from embedded payload', () => {
      const states = extractNiPaymentStates({
        _embedded: {
          payment: [{ state: 'FAILED' }, { state: 'CAPTURED' }],
        },
      });
      expect(states).toEqual(expect.arrayContaining(['FAILED', 'CAPTURED']));
    });

    it('returns empty array when no payments', () => {
      expect(extractNiPaymentStates({})).toEqual([]);
    });
  });

  describe('isNiOrderUuid', () => {
    it('accepts lowercase UUID', () => {
      expect(isNiOrderUuid('a13f81f3-27b4-48b6-88de-22b9ddc1e1dc')).toBe(true);
    });

    it('rejects internal merchant refs', () => {
      expect(isNiOrderUuid('FTR-4916FD-MSPXSTSH')).toBe(false);
      expect(isNiOrderUuid('SFAT-U1-TEST')).toBe(false);
    });
  });

  describe('isInternalMerchantOrderReference', () => {
    it('detects Sarh merchant order prefixes', () => {
      expect(isInternalMerchantOrderReference('FTR-4916FD-MSPXSTSH')).toBe(
        true,
      );
      expect(isInternalMerchantOrderReference('PRM-ABC123')).toBe(true);
    });

    it('rejects NI UUIDs', () => {
      expect(
        isInternalMerchantOrderReference(
          'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        ),
      ).toBe(false);
    });
  });

  describe('extractNiOrderReference', () => {
    const niUuid = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';

    it('extracts UUID from reference field', () => {
      expect(extractNiOrderReference({ reference: niUuid })).toBe(niUuid);
    });

    it('extracts UUID from _id urn:order href', () => {
      expect(extractNiOrderReference({ _id: `urn:order:${niUuid}` })).toBe(
        niUuid,
      );
    });

    it('does not fall back to merchant orderReference', () => {
      expect(
        extractNiOrderReference({
          orderReference: 'FTR-4916FD-MSPXSTSH',
        }),
      ).toBeNull();
    });

    it('returns null when no UUID is present', () => {
      expect(extractNiOrderReference({ state: 'STARTED' })).toBeNull();
    });
  });

  describe('formatNiGatewayError', () => {
    it('formats NiGatewayError with status', () => {
      const err = new NiGatewayError('gateway down', 'fetch_order', 502);
      expect(formatNiGatewayError(err)).toContain('gateway down');
      expect(formatNiGatewayError(err)).toContain('502');
    });

    it('formats generic Error', () => {
      expect(formatNiGatewayError(new Error('boom'))).toBe('boom');
    });

    it('stringifies unknown', () => {
      expect(formatNiGatewayError(42)).toBe('42');
    });
  });
});

/**
 * Payment fulfillment contract (no DB):
 * Only CAPTURED/PURCHASED may activate subscription / listing / order.
 * Cancel / decline / expire / fail must NOT fulfill.
 */
describe('Payment fulfillment gate contract', () => {
  const fulfillable = (state: string) =>
    classifyNiOrderState(state) === 'success';

  it('does not fulfill on cancel', () => {
    expect(fulfillable('CANCELLED')).toBe(false);
  });

  it('does not fulfill on expire', () => {
    expect(fulfillable('EXPIRED')).toBe(false);
  });

  it('does not fulfill on decline/fail', () => {
    expect(fulfillable('DECLINED')).toBe(false);
    expect(fulfillable('FAILED')).toBe(false);
  });

  it('does not fulfill while processing', () => {
    expect(fulfillable('STARTED')).toBe(false);
    expect(fulfillable('PENDING')).toBe(false);
  });

  it('fulfills only on confirmed capture/purchase', () => {
    expect(fulfillable('CAPTURED')).toBe(true);
    expect(fulfillable('PURCHASED')).toBe(true);
  });
});
