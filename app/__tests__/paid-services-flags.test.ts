import {
  DEFAULT_PAID_SERVICE_FLAGS,
  firstEnabledBoostType,
  firstEnabledPromoteGoal,
  hasAnyBoostService,
  isBoostTypeEnabled,
  isPromoteGoalEnabled,
  type PaidServiceFlags,
} from '@/services/paidServices';

describe('paid service flag helpers', () => {
  const allOff: PaidServiceFlags = {
    promotionEnabled: false,
    pinEnabled: false,
    featureEnabled: false,
    listingFeesEnabled: false,
  };

  it('defaults enable every service', () => {
    expect(hasAnyBoostService(DEFAULT_PAID_SERVICE_FLAGS)).toBe(true);
    expect(firstEnabledPromoteGoal(DEFAULT_PAID_SERVICE_FLAGS)).toBe('visibility');
    expect(firstEnabledBoostType(DEFAULT_PAID_SERVICE_FLAGS)).toBe('pinned');
  });

  it('returns null when all boost services are off', () => {
    expect(hasAnyBoostService(allOff)).toBe(false);
    expect(firstEnabledPromoteGoal(allOff)).toBeNull();
    expect(firstEnabledBoostType(allOff)).toBeNull();
  });

  it('gates goals and boost types independently', () => {
    const flags: PaidServiceFlags = {
      ...allOff,
      pinEnabled: true,
      featureEnabled: true,
    };
    expect(isPromoteGoalEnabled('visibility', flags)).toBe(false);
    expect(isPromoteGoalEnabled('pinned', flags)).toBe(true);
    expect(isBoostTypeEnabled('promotion', flags)).toBe(false);
    expect(isBoostTypeEnabled('featured', flags)).toBe(true);
    expect(firstEnabledPromoteGoal(flags)).toBe('pinned');
  });
});
