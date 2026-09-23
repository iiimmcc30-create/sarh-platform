import { isKgSaleUnit } from '../../integrations/daftra/daftra-unit.util';

export type ProductSaleUnitSource = {
  pricePerKg: number | null;
  priceFixed: number | null;
  daftraLink?: { daftraSaleUnit: string | null } | null;
};

export function resolveProductSaleUnit(
  product: ProductSaleUnitSource,
): string | null {
  return product.daftraLink?.daftraSaleUnit?.trim() || null;
}

export function isDaftraKgProduct(product: ProductSaleUnitSource): boolean {
  const saleUnit = resolveProductSaleUnit(product);
  return (
    product.priceFixed != null &&
    product.pricePerKg == null &&
    isKgSaleUnit(saleUnit)
  );
}

export function isDaftraUnitCountProduct(
  product: ProductSaleUnitSource,
): boolean {
  const saleUnit = resolveProductSaleUnit(product);
  return (
    product.priceFixed != null &&
    product.pricePerKg == null &&
    Boolean(saleUnit) &&
    !isKgSaleUnit(saleUnit)
  );
}
