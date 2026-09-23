import { apiClient, unwrap } from './api.client';

export const MEAT_CATEGORIES = [
  'whole_livestock',
  'lamb',
  'beef',
  'camel',
  'chicken',
  'goat',
  'special_orders',
] as const;

export type MeatCategory = (typeof MEAT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MeatCategory, string> = {
  whole_livestock: 'ذبائح كاملة',
  lamb: 'غنم',
  beef: 'بقر',
  camel: 'إبل',
  chicken: 'دجاج',
  goat: 'ماعز',
  special_orders: 'طلبات خاصة',
};

export const CUT_OPTIONS = [
  'whole',
  'half',
  'quarter',
  'ribs',
  'leg',
  'shoulder',
  'liver',
  'mixed',
  'custom',
] as const;

export type StockKind = 'ok' | 'low' | 'out';

export type ButcherProduct = {
  id: string;
  butcherId: string;
  nameAr: string;
  nameEn: string;
  category: MeatCategory;
  images: string[];
  pricePerKg: number | null;
  priceFixed: number | null;
  pricingNoteAr: string | null;
  availableCuts: string[];
  weightMin: number | null;
  weightMax: number | null;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity?: number;
  stock?: StockKind;
  inStock: boolean;
  freshness: string;
  descriptionAr: string;
  descriptionEn: string;
  country: string;
};

export type ProductWritePayload = {
  nameAr: string;
  nameEn: string;
  category: MeatCategory;
  images: string[];
  pricePerKg?: number | null;
  priceFixed?: number | null;
  availableCuts: string[];
  weightMin?: number | null;
  weightMax?: number | null;
  availableQuantity?: number | null;
  inStock?: boolean;
  freshness?: string;
  descriptionAr: string;
  descriptionEn: string;
  country: string;
};

export async function fetchMyProducts(): Promise<ButcherProduct[]> {
  const res = await apiClient.get('/butchers/products/mine');
  return unwrap<ButcherProduct[]>(res);
}

export async function createMyProduct(body: ProductWritePayload): Promise<ButcherProduct> {
  const res = await apiClient.post('/butchers/products', body);
  return unwrap<ButcherProduct>(res);
}

export async function updateMyProduct(
  id: string,
  body: Partial<ProductWritePayload>,
): Promise<ButcherProduct> {
  const res = await apiClient.put(`/butchers/products/${id}`, body);
  return unwrap<ButcherProduct>(res);
}

export async function deleteMyProduct(id: string): Promise<void> {
  await apiClient.delete(`/butchers/products/${id}`);
}

export function pricingLabel(product: Pick<ButcherProduct, 'pricePerKg' | 'priceFixed'>): string {
  if (product.priceFixed != null) {
    return `${product.priceFixed.toLocaleString('ar-SA')} ر.س (ثابت)`;
  }
  if (product.pricePerKg != null) {
    return `${product.pricePerKg.toLocaleString('ar-SA')} ر.س / كجم`;
  }
  return '—';
}

export function stockLabel(kind: StockKind | undefined): string {
  if (kind === 'out') return 'نفد';
  if (kind === 'low') return 'منخفض';
  return 'متوفر';
}
