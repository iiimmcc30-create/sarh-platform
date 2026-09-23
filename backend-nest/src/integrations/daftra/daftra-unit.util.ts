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

/** True when a Daftra sale unit string means weight in kilograms. */
export function isKgSaleUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return false;
  if (KG_UNIT_ALIASES.has(normalized)) return true;
  return normalized === 'kg' || normalized.endsWith('kg');
}

function pickFirstString(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Extracts the selling unit label from a Daftra products.json row.
 * Returns null when the API payload does not include a unit (no guessing).
 */
export function extractDaftraSaleUnit(raw: unknown): string | null {
  const row = asRecord(raw);
  const product = row ? (asRecord(row.Product) ?? row) : null;
  if (!product) return null;

  const unitTemplate =
    asRecord(row?.UnitTemplate) ?? asRecord(product.UnitTemplate);
  const sellUnit =
    asRecord(row?.SellUnit) ??
    asRecord(product.SellUnit) ??
    asRecord(row?.ProductSellUnit) ??
    asRecord(product.ProductSellUnit);
  const unitFactor =
    asRecord(row?.UnitFactor) ??
    asRecord(product.UnitFactor) ??
    asRecord(row?.ProductUnitFactor) ??
    asRecord(product.ProductUnitFactor);

  return pickFirstString(
    asString(product.unit_name),
    asString(product.unit_small_name),
    asString(product.sell_unit_name),
    asString(product.sale_unit_name),
    asString(product.selling_unit_name),
    asString(product.unit),
    asString(product.default_unit),
    asString(sellUnit?.small_name),
    asString(sellUnit?.factor_name),
    asString(sellUnit?.name),
    asString(unitFactor?.small_name),
    asString(unitFactor?.factor_name),
    asString(unitTemplate?.unit_small_name),
    asString(unitTemplate?.main_unit_name),
  );
}
