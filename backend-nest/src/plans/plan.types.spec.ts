import {
  buildPermissions,
  FREE_PLAN_SLUG,
  isUnlimited,
  normalizePlanSlug,
  parseFeatureValue,
  permissionBoolean,
  permissionNumber,
} from './plan.types';

describe('plan.types', () => {
  it('normalizePlanSlug maps legacy slugs', () => {
    expect(normalizePlanSlug(' starter ')).toBe('sarh-pro');
    expect(normalizePlanSlug('PRO')).toBe('sarh-pro');
    expect(normalizePlanSlug('vip')).toBe('sarh-pro');
    expect(normalizePlanSlug('sarh_pro')).toBe('sarh-pro');
    expect(normalizePlanSlug('free')).toBe(FREE_PLAN_SLUG);
  });

  it('parseFeatureValue handles BOOLEAN NUMBER JSON STRING', () => {
    expect(parseFeatureValue('true', 'BOOLEAN')).toBe(true);
    expect(parseFeatureValue('false', 'BOOLEAN')).toBe(false);
    expect(parseFeatureValue('10', 'NUMBER')).toBe(10);
    expect(parseFeatureValue('x', 'NUMBER')).toBe(0);
    expect(parseFeatureValue('{"a":1}', 'JSON')).toEqual({ a: 1 });
    expect(parseFeatureValue('{bad', 'JSON')).toBe('{bad');
    expect(parseFeatureValue('hello', 'STRING')).toBe('hello');
  });

  it('buildPermissions aggregates features', () => {
    const perms = buildPermissions([
      { key: 'monthlyPinnedAds', value: '10', valueType: 'NUMBER' },
      { key: 'prioritySearch', value: 'true', valueType: 'BOOLEAN' },
    ]);
    expect(perms.monthlyPinnedAds).toBe(10);
    expect(perms.prioritySearch).toBe(true);
  });

  it('isUnlimited treats negative as unlimited', () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(5)).toBe(false);
  });

  it('permissionNumber / permissionBoolean with fallbacks', () => {
    expect(permissionNumber({ maxAdsPer24Hours: 3 }, 'maxAdsPer24Hours')).toBe(
      3,
    );
    expect(
      permissionNumber({ maxAdsPer24Hours: '2' }, 'maxAdsPer24Hours'),
    ).toBe(2);
    expect(permissionNumber({}, 'missing', 9)).toBe(9);
    expect(permissionBoolean({ verifiedBadge: true }, 'verifiedBadge')).toBe(
      true,
    );
    expect(permissionBoolean({ verifiedBadge: 'true' }, 'verifiedBadge')).toBe(
      true,
    );
    expect(permissionBoolean({}, 'missing', false)).toBe(false);
  });
});
