import { extractDaftraSaleUnit, isKgSaleUnit } from './daftra-unit.util';

describe('daftra-unit.util', () => {
  it('detects kg unit aliases', () => {
    expect(isKgSaleUnit('kg')).toBe(true);
    expect(isKgSaleUnit('Kg')).toBe(true);
    expect(isKgSaleUnit('KG')).toBe(true);
    expect(isKgSaleUnit('كجم')).toBe(true);
    expect(isKgSaleUnit('قطعة')).toBe(false);
    expect(isKgSaleUnit('')).toBe(false);
  });

  it('extracts unit from product fields when present', () => {
    expect(
      extractDaftraSaleUnit({
        Product: {
          id: 1,
          name: 'لحم',
          unit_small_name: 'كجم',
        },
      }),
    ).toBe('كجم');
  });

  it('extracts unit from nested sell unit payload', () => {
    expect(
      extractDaftraSaleUnit({
        Product: { id: 2, name: 'صدر' },
        SellUnit: { small_name: 'قطعة' },
      }),
    ).toBe('قطعة');
  });

  it('returns null when API payload has no unit', () => {
    expect(
      extractDaftraSaleUnit({
        Product: { id: 3, name: 'منتج' },
      }),
    ).toBeNull();
  });
});
