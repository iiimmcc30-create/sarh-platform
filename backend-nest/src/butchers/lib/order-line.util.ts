import { throwApi } from '../../common/exceptions/api.exception';
import {
  isDaftraKgProduct,
  isDaftraUnitCountProduct,
  type ProductSaleUnitSource,
} from './product-sale-unit.util';

export type ProductForOrderLine = ProductSaleUnitSource & {
  id: string;
  butcherId: string;
  inStock: boolean;
  weightMin: number | null;
  weightMax: number | null;
};

export type ValidatedOrderLine = {
  productId: string;
  cutType: string;
  weightKg: number;
  linePrice: number;
  reservedQuantity: number;
};

/** Same pricing rules as ButchersService.createOrder (backend source of truth). */
export function computeOrderLinePrice(
  product: ProductSaleUnitSource,
  weightKg: number,
): number {
  let totalPrice: number;
  if (product.pricePerKg != null) {
    totalPrice = product.pricePerKg * weightKg;
  } else if (isDaftraKgProduct(product)) {
    totalPrice = (product.priceFixed ?? 0) * weightKg;
  } else if (isDaftraUnitCountProduct(product)) {
    const units = Math.max(1, Math.round(weightKg));
    totalPrice = (product.priceFixed ?? 0) * units;
  } else if (product.priceFixed != null) {
    totalPrice = product.priceFixed;
  } else {
    throwApi(400, 'validation_error', 'المنتج لا يحتوي على سعر');
  }
  return Math.round((totalPrice + Number.EPSILON) * 100) / 100;
}

export function validateAndPriceOrderLine(
  product: ProductForOrderLine | null,
  butcherId: string,
  line: { productId: string; cutType: string; weightKg: number },
): ValidatedOrderLine {
  if (!product || product.butcherId !== butcherId) {
    throwApi(404, 'not_found', 'المنتج غير موجود');
  }

  if (!product.inStock) {
    throwApi(400, 'validation_error', 'المنتج غير متوفر حالياً');
  }

  if (product.weightMin != null && line.weightKg < product.weightMin) {
    throwApi(
      400,
      'validation_error',
      `الوزن يجب أن يكون ${product.weightMin} كجم على الأقل`,
    );
  }

  if (product.weightMax != null && line.weightKg > product.weightMax) {
    throwApi(
      400,
      'validation_error',
      `الوزن يجب ألا يتجاوز ${product.weightMax} كجم`,
    );
  }

  const linePrice = computeOrderLinePrice(product, line.weightKg);
  const reservedQuantity = Math.max(line.weightKg, 0);

  return {
    productId: line.productId,
    cutType: line.cutType,
    weightKg: line.weightKg,
    linePrice,
    reservedQuantity,
  };
}

export function sumOrderLinePrices(lines: ValidatedOrderLine[]): number {
  const cents = lines.reduce(
    (acc, line) => acc + Math.round((line.linePrice + Number.EPSILON) * 100),
    0,
  );
  return cents / 100;
}
