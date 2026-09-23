import { ApiException } from '../../common/exceptions/api.exception';
import {
  categoryRequiresWeight,
  isLivestockCategory,
  isSlaughterCategory,
  resolveLegacyListingCategory,
} from '../listing-categories';

describe('listing category weight rules', () => {
  it('requires weight only for slaughter (ذبائح)', () => {
    expect(isSlaughterCategory('slaughter')).toBe(true);
    expect(categoryRequiresWeight('slaughter')).toBe(true);
    expect(categoryRequiresWeight('sheep')).toBe(false);
    expect(categoryRequiresWeight('camels')).toBe(false);
    expect(categoryRequiresWeight('feed')).toBe(false);
    expect(categoryRequiresWeight('equipment')).toBe(false);
    expect(isSlaughterCategory('sheep-carcass')).toBe(true);
    expect(categoryRequiresWeight('sheep-carcass')).toBe(true);
    expect(isSlaughterCategory('slaughter-other')).toBe(true);
  });

  it('requires weight when parent.requiresWeight is true', () => {
    expect(categoryRequiresWeight('sheep', true)).toBe(true);
    expect(categoryRequiresWeight('sheep', false)).toBe(false);
  });

  it('keeps isLivestockCategory for legacy live species', () => {
    expect(isLivestockCategory('sheep')).toBe(true);
    expect(isLivestockCategory('camels')).toBe(true);
    expect(isLivestockCategory('slaughter')).toBe(false);
    expect(isLivestockCategory('feed')).toBe(false);
  });
});

describe('resolveLegacyListingCategory', () => {
  it('prefers subcategory.legacyCategory', () => {
    expect(
      resolveLegacyListingCategory({
        slug: 'sheep-carcass',
        legacyCategory: 'sheep',
        parent: { slug: 'slaughter', legacyCategory: 'slaughter' },
      }),
    ).toBe('sheep');
  });

  it('falls back to parent slug mapping', () => {
    expect(
      resolveLegacyListingCategory({
        slug: 'barley',
        legacyCategory: null,
        parent: { slug: 'feed', legacyCategory: null },
      }),
    ).toBe('feed');
  });
});

/** Mirrors ListingsService.assertWeightForCategory for unit coverage */
function assertWeightForCategory(
  category: string,
  weightKg?: number | null,
  parentRequiresWeight?: boolean | null,
) {
  if (categoryRequiresWeight(category, parentRequiresWeight)) {
    if (weightKg == null || weightKg <= 0) {
      throw new ApiException(
        400,
        'weight_required',
        'الوزن مطلوب للذبائح ويجب أن يكون بالكيلوغرام',
      );
    }
    return;
  }
  if (weightKg != null && weightKg <= 0) {
    throw new ApiException(400, 'invalid_weight', 'قيمة الوزن غير صالحة');
  }
}

describe('assertWeightForCategory', () => {
  it('throws when slaughter listing has no weight', () => {
    expect(() => assertWeightForCategory('slaughter', null)).toThrow(
      ApiException,
    );
    expect(() => assertWeightForCategory('slaughter', undefined)).toThrow(
      ApiException,
    );
  });

  it('allows livestock live species without weight', () => {
    expect(() => assertWeightForCategory('sheep', null)).not.toThrow();
    expect(() => assertWeightForCategory('camels', undefined)).not.toThrow();
    expect(() => assertWeightForCategory('goats', 120)).not.toThrow();
  });

  it('accepts slaughter when weight is positive', () => {
    expect(() => assertWeightForCategory('slaughter', 45)).not.toThrow();
  });
});
