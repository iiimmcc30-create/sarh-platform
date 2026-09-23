const KG_UNIT_ALIASES = new Set([
  'kg',
  'kilogram',
  'kilograms',
  'كجم',
  'كيلو',
  'كيلوغرام',
  'كيلوجرام',
  'كغ',
]);

export type SaleUnitSource = {
  saleUnit?: string | null;
  daftraLink?: { daftraSaleUnit?: string | null } | null;
};

export function isKgSaleUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return false;
  if (KG_UNIT_ALIASES.has(normalized)) return true;
  return normalized === 'kg' || normalized.endsWith('kg');
}

export function resolveSaleUnit(source?: SaleUnitSource | null): string | null {
  if (!source) return null;
  if (typeof source.saleUnit === 'string' && source.saleUnit.trim()) {
    return source.saleUnit.trim();
  }
  const fromLink = source.daftraLink?.daftraSaleUnit?.trim();
  return fromLink || null;
}

export function formatOrderQuantityLabel(
  weightKg: number | string | null | undefined,
  source?: SaleUnitSource | null,
): string {
  if (weightKg == null || weightKg === '') return '';
  const amount = Number(weightKg);
  if (!Number.isFinite(amount)) return '';
  const saleUnit = resolveSaleUnit(source);
  if (saleUnit && !isKgSaleUnit(saleUnit)) {
    return String(Math.max(1, Math.round(amount)));
  }
  return `${amount} كغ`;
}
