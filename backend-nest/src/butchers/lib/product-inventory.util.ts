/** Display-only threshold (kg). Matches mobile ops cards. Not a database field. */
export const LOW_STOCK_DISPLAY_THRESHOLD_KG = 5;

export function sellableQuantity(product: {
  availableQuantity: number;
  reservedQuantity: number;
}): number {
  return product.availableQuantity - product.reservedQuantity;
}

export function classifyProductStock(product: {
  inStock: boolean;
  availableQuantity: number;
  reservedQuantity: number;
}): 'ok' | 'low' | 'out' {
  const sellable = sellableQuantity(product);
  if (!product.inStock || sellable <= 0) return 'out';
  if (sellable <= LOW_STOCK_DISPLAY_THRESHOLD_KG) return 'low';
  return 'ok';
}

export function resolveProductAvailableQuantity(input: {
  availableQuantity?: number | null;
  weightMax?: number | null;
  weightMin?: number | null;
}): number {
  if (
    input.availableQuantity != null &&
    Number.isFinite(input.availableQuantity) &&
    input.availableQuantity >= 0
  ) {
    return input.availableQuantity;
  }
  const fromMax =
    input.weightMax != null && input.weightMax > 0 ? input.weightMax : null;
  const fromMin =
    input.weightMin != null && input.weightMin > 0 ? input.weightMin : null;
  return fromMax ?? fromMin ?? 0;
}
