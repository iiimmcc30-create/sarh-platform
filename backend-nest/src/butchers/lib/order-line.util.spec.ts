import { ApiException } from '../../common/exceptions/api.exception';
import {
  computeOrderLinePrice,
  sumOrderLinePrices,
  validateAndPriceOrderLine,
} from './order-line.util';

const product = {
  id: 'p1',
  butcherId: 'b1',
  inStock: true,
  weightMin: 1,
  weightMax: 10,
  priceFixed: null as number | null,
  pricePerKg: 50,
};

describe('order-line.util', () => {
  it('computes per-kg line price', () => {
    expect(computeOrderLinePrice(product, 2)).toBe(100);
  });

  it('computes fixed line price regardless of weight', () => {
    expect(
      computeOrderLinePrice({ priceFixed: 120, pricePerKg: null }, 3),
    ).toBe(120);
  });

  it('computes Daftra kg line price from weight', () => {
    expect(
      computeOrderLinePrice(
        {
          priceFixed: 30,
          pricePerKg: null,
          daftraLink: { daftraSaleUnit: 'kg' },
        },
        2.5,
      ),
    ).toBe(75);
  });

  it('computes Daftra unit-count line price from quantity', () => {
    expect(
      computeOrderLinePrice(
        {
          priceFixed: 30,
          pricePerKg: null,
          daftraLink: { daftraSaleUnit: 'قطعة' },
        },
        3,
      ),
    ).toBe(90);
  });

  it('validates weight bounds and prices a line', () => {
    const line = validateAndPriceOrderLine(product, 'b1', {
      productId: 'p1',
      cutType: 'whole',
      weightKg: 2,
    });
    expect(line.linePrice).toBe(100);
    expect(line.reservedQuantity).toBe(2);
  });

  it('rejects out-of-range weight', () => {
    expect(() =>
      validateAndPriceOrderLine(product, 'b1', {
        productId: 'p1',
        cutType: 'whole',
        weightKg: 0.5,
      }),
    ).toThrow(ApiException);
  });

  it('sums line prices with rounding', () => {
    expect(
      sumOrderLinePrices([
        {
          productId: 'a',
          cutType: 'x',
          weightKg: 1,
          linePrice: 33.33,
          reservedQuantity: 1,
        },
        {
          productId: 'b',
          cutType: 'y',
          weightKg: 1,
          linePrice: 33.33,
          reservedQuantity: 1,
        },
        {
          productId: 'c',
          cutType: 'z',
          weightKg: 1,
          linePrice: 33.34,
          reservedQuantity: 1,
        },
      ]),
    ).toBe(100);
  });

  it('sums 0.1 + 0.2 without binary float drift', () => {
    expect(
      sumOrderLinePrices([
        {
          productId: 'a',
          cutType: 'x',
          weightKg: 1,
          linePrice: 0.1,
          reservedQuantity: 1,
        },
        {
          productId: 'b',
          cutType: 'y',
          weightKg: 1,
          linePrice: 0.2,
          reservedQuantity: 1,
        },
      ]),
    ).toBe(0.3);
  });
});
