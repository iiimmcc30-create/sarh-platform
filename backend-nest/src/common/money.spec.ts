import { Prisma } from '@prisma/client';
import {
  moneyToNumber,
  sameMoney,
  serializeMoneyTree,
  toMoneyDecimal,
} from './money';

describe('money', () => {
  it('rounds a binary float to halalas before storing', () => {
    const stored = toMoneyDecimal(19.99);
    expect(stored.toFixed(2)).toBe('19.99');
    expect(stored.equals(new Prisma.Decimal('19.99'))).toBe(true);
    expect(moneyToNumber(19.99)).toBe(19.99);
  });

  it('treats equal halalas as the same amount', () => {
    expect(sameMoney(10.1, '10.10')).toBe(true);
    expect(sameMoney(new Prisma.Decimal('10.10'), 10.1)).toBe(true);
    expect(sameMoney(10, 10.01)).toBe(false);
  });

  it('serializes Decimal trees to JSON numbers and leaves dates alone', () => {
    const createdAt = new Date('2026-10-17T00:00:00.000Z');
    const payload = serializeMoneyTree({
      amount: toMoneyDecimal('49.50'),
      nested: [{ price: toMoneyDecimal(1.5) }],
      createdAt,
      label: 'sar',
    });
    expect(payload.amount).toBe(49.5);
    expect(payload.nested[0].price).toBe(1.5);
    expect(payload.createdAt).toBe(createdAt);
    expect(JSON.parse(JSON.stringify(payload)).amount).toBe(49.5);
  });
});
