import {
  DEFAULT_PAID_SERVICE_FLAGS,
  PAID_SERVICE_SETTING_DEFAULTS,
  PAID_SERVICE_SETTING_KEYS,
} from '../paid-services.constants';

describe('paid service setting defaults', () => {
  it('exposes four independent toggles', () => {
    expect(Object.keys(PAID_SERVICE_SETTING_KEYS)).toEqual([
      'promotion',
      'pin',
      'feature',
      'listingFees',
    ]);
    expect(PAID_SERVICE_SETTING_DEFAULTS).toHaveLength(4);
    expect(
      PAID_SERVICE_SETTING_DEFAULTS.every(
        (row) => row.category === 'paid_services',
      ),
    ).toBe(true);
    expect(
      PAID_SERVICE_SETTING_DEFAULTS.every((row) => row.value === true),
    ).toBe(true);
  });

  it('defaults all services to enabled', () => {
    expect(DEFAULT_PAID_SERVICE_FLAGS).toEqual({
      promotionEnabled: true,
      pinEnabled: true,
      featureEnabled: true,
      listingFeesEnabled: true,
    });
  });
});
