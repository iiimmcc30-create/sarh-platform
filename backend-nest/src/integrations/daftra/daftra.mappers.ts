import { extractDaftraSaleUnit } from './daftra-unit.util';

export type DaftraProduct = {
  id: number;
  name: string;
  sku: string | null;
  price: number | null;
  quantity: number | null;
  trackStock: boolean;
  barcode: string | null;
  description: string | null;
  /** Selling unit from Daftra when present in API payload; null otherwise. */
  saleUnit: string | null;
};

/** Fields used to create/update a Sarh ButcherProduct from a Daftra product. */
export type SarhProductSyncFields = {
  nameAr: string;
  nameEn: string;
  category: 'special_orders';
  images: string[];
  priceFixed: number | null;
  pricePerKg: null;
  availableCuts: string[];
  availableQuantity: number;
  inStock: boolean;
  freshness: string;
  descriptionAr: string;
  descriptionEn: string;
};

export type DaftraStockLevel = {
  storeId: number | null;
  storeName: string | null;
  quantity: number | null;
};

export type DaftraProductStock = {
  productId: number;
  name: string | null;
  sku: string | null;
  quantity: number | null;
  trackStock: boolean;
  source: 'stock_balance' | 'stock_levels';
  levels: DaftraStockLevel[];
};

export type DaftraProductPage = {
  items: DaftraProduct[];
  page: number;
  pageCount: number;
  totalResults: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function unwrapProductRecord(
  raw: unknown,
): Record<string, unknown> | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (asRecord(record.Product)) return asRecord(record.Product);
  if (typeof record.id === 'number' || typeof record.id === 'string')
    return record;
  return null;
}

export function mapDaftraProduct(raw: unknown): DaftraProduct | null {
  const product = unwrapProductRecord(raw);
  if (!product) return null;
  const id = asNumber(product.id);
  if (id == null) return null;
  const track = asNumber(product.track_stock);
  return {
    id,
    name: asString(product.name) ?? '',
    sku: asString(product.product_code),
    price: asNumber(product.unit_price),
    quantity: asNumber(product.stock_balance),
    trackStock: track === 1,
    barcode: asString(product.barcode),
    description: asString(product.description),
    saleUnit: extractDaftraSaleUnit(raw),
  };
}

function clampName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'منتج دفترة';
  return trimmed.slice(0, 100);
}

function ensureDescription(
  primary: string | null,
  fallbackName: string,
): string {
  const raw = (primary?.trim() || fallbackName).trim();
  if (raw.length >= 5) return raw.slice(0, 1000);
  return `${raw} — مستورد من دفترة`.slice(0, 1000);
}

/**
 * Maps a Daftra catalog product into Sarh ButcherProduct create/update fields.
 * Does not invent meat categories — defaults to special_orders.
 */
export function mapDaftraProductToSarhFields(
  product: DaftraProduct,
): SarhProductSyncFields | null {
  if (!product.id || !product.name?.trim()) return null;
  const name = clampName(product.name);
  const qty =
    product.quantity != null && Number.isFinite(product.quantity)
      ? Math.max(0, product.quantity)
      : 0;
  const price =
    product.price != null && Number.isFinite(product.price) && product.price > 0
      ? product.price
      : null;
  const description = ensureDescription(product.description, name);
  return {
    nameAr: name,
    nameEn: name,
    category: 'special_orders',
    images: [],
    priceFixed: price,
    pricePerKg: null,
    availableCuts: ['عام'],
    availableQuantity: qty,
    inStock: product.trackStock ? qty > 0 : true,
    freshness: 'fresh',
    descriptionAr: description,
    descriptionEn: description,
  };
}

export function mapDaftraProductPage(body: unknown): DaftraProductPage {
  const root = asRecord(body) ?? {};
  const rows = Array.isArray(root.data) ? root.data : [];
  const pagination = asRecord(root.pagination) ?? {};
  return {
    items: rows
      .map((row) => mapDaftraProduct(row))
      .filter((row): row is DaftraProduct => row != null),
    page: asNumber(pagination.page) ?? 1,
    pageCount: asNumber(pagination.page_count) ?? 1,
    totalResults: asNumber(pagination.total_results) ?? rows.length,
  };
}

export function mapDaftraProductStock(
  body: unknown,
): DaftraProductStock | null {
  const root = asRecord(body) ?? {};
  const data = asRecord(root.data) ?? root;
  const product =
    unwrapProductRecord(data.Product ? data : data) ??
    unwrapProductRecord(data);
  if (!product) return null;
  const id = asNumber(product.id);
  if (id == null) return null;

  const levelsRaw = Array.isArray(data.StockLevels) ? data.StockLevels : [];
  const levels: DaftraStockLevel[] = levelsRaw.map((row) => {
    const rec = asRecord(row) ?? {};
    return {
      storeId: asNumber(rec.store_id),
      storeName: asString(rec.store_name),
      quantity: asNumber(rec.quantity),
    };
  });

  const fromLevels = levels.reduce<number | null>((sum, level) => {
    if (level.quantity == null) return sum;
    return (sum ?? 0) + level.quantity;
  }, null);

  const stockBalance = asNumber(product.stock_balance);
  const track = asNumber(product.track_stock) === 1;

  return {
    productId: id,
    name: asString(product.name),
    sku: asString(product.product_code),
    quantity: fromLevels ?? stockBalance,
    trackStock: track,
    source: fromLevels != null ? 'stock_levels' : 'stock_balance',
    levels,
  };
}
