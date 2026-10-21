import { Prisma } from '@prisma/client';

/** Values accepted wherever a SAR amount is stored or compared. */
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/**
 * DECIMAL(12,2) value safe to persist. `new Prisma.Decimal(19.99)` keeps the
 * binary residue of the JS number; rounding through a 2-place string does not.
 */
export function toMoneyDecimal(value: MoneyInput): Prisma.Decimal {
  if (value == null || value === '') return new Prisma.Decimal(0);
  if (Prisma.Decimal.isDecimal(value)) {
    return new Prisma.Decimal(value.toFixed(2));
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error('invalid money amount');
  }
  return new Prisma.Decimal(numeric.toFixed(2));
}

/**
 * JSON number for a stored money value. The string round-trip matches the
 * DECIMAL(12,2) column, so clients keep receiving a number (not a Decimal
 * object) that prints back to the same halalas.
 */
export function moneyToNumber(value: MoneyInput): number {
  return Number(toMoneyDecimal(value).toFixed(2));
}

export function sameMoney(a: MoneyInput, b: MoneyInput): boolean {
  return toMoneyDecimal(a).equals(toMoneyDecimal(b));
}

/** Walk an API payload and replace Prisma.Decimal with a JSON number. */
export function serializeMoneyTree<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return moneyToNumber(value);
  if (value instanceof Date || value instanceof Buffer) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = walk(nested);
  }
  return out;
}
