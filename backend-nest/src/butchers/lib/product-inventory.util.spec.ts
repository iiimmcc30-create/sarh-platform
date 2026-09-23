import {
  classifyProductStock,
  resolveProductAvailableQuantity,
  sellableQuantity,
} from './product-inventory.util';

describe('resolveProductAvailableQuantity', () => {
  it('uses explicit availableQuantity when provided', () => {
    expect(resolveProductAvailableQuantity({ availableQuantity: 25 })).toBe(25);
  });

  it('falls back to weightMax then weightMin', () => {
    expect(
      resolveProductAvailableQuantity({ weightMax: 10, weightMin: 5 }),
    ).toBe(10);
    expect(resolveProductAvailableQuantity({ weightMin: 7 })).toBe(7);
  });

  it('defaults to zero when nothing is set', () => {
    expect(resolveProductAvailableQuantity({})).toBe(0);
  });
});

describe('classifyProductStock', () => {
  it('treats sellable as available minus reserved', () => {
    expect(
      sellableQuantity({ availableQuantity: 19, reservedQuantity: 9 }),
    ).toBe(10);
  });

  it('marks out of stock when hidden or sellable is zero', () => {
    expect(
      classifyProductStock({
        inStock: false,
        availableQuantity: 10,
        reservedQuantity: 0,
      }),
    ).toBe('out');
    expect(
      classifyProductStock({
        inStock: true,
        availableQuantity: 9,
        reservedQuantity: 9,
      }),
    ).toBe('out');
  });

  it('marks low when sellable is at most 5 kg', () => {
    expect(
      classifyProductStock({
        inStock: true,
        availableQuantity: 14,
        reservedQuantity: 9,
      }),
    ).toBe('low');
  });
});
