import { API_BASE } from '@/services/api';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';
import { FEED_TIMEOUT_MS } from '@/services/fetchPublicFeed';
import type { FeedProductCategory } from '@/lib/feedSuppliers';

export type FeedProduct = {
  id: string;
  supplierId: string;
  nameAr: string;
  description?: string | null;
  category: FeedProductCategory;
  imageUrl?: string | null;
  weightLabel?: string | null;
  available: boolean;
  published: boolean;
};

export type FeedSupplier = {
  id: string;
  nameAr: string;
  logo?: string | null;
  cover?: string | null;
  description?: string | null;
  cityAr: string;
  districtAr?: string | null;
  addressAr?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  hoursAr?: string | null;
  verified: boolean;
  published: boolean;
  productCount?: number;
  products?: FeedProduct[];
  _count?: { products: number };
};

function productCount(supplier: FeedSupplier): number {
  return supplier.productCount ?? supplier._count?.products ?? supplier.products?.length ?? 0;
}

function normalizeSupplier(row: FeedSupplier): FeedSupplier {
  return { ...row, productCount: productCount(row) };
}

export async function fetchFeedSuppliers(options?: {
  q?: string;
  category?: FeedProductCategory | 'all';
}): Promise<FeedSupplier[]> {
  const params = new URLSearchParams();
  const q = options?.q?.trim();
  if (q) params.set('q', q);
  if (options?.category && options.category !== 'all') params.set('category', options.category);
  const qs = params.toString();
  const res = await fetchWithTimeout(
    `${API_BASE}/api/feed-suppliers${qs ? `?${qs}` : ''}`,
    {},
    FEED_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error('تعذر تحميل الموردين');
  const json = (await res.json()) as { data?: { suppliers?: FeedSupplier[] } };
  return Array.isArray(json.data?.suppliers) ? json.data.suppliers.map(normalizeSupplier) : [];
}

export async function fetchFeedSupplier(id: string): Promise<FeedSupplier> {
  const res = await fetchWithTimeout(`${API_BASE}/api/feed-suppliers/${id}`, {}, FEED_TIMEOUT_MS);
  if (!res.ok) throw new Error('تعذر تحميل المورد');
  const json = (await res.json()) as { data?: { supplier?: FeedSupplier } };
  if (!json.data?.supplier) throw new Error('المورد غير موجود');
  return normalizeSupplier(json.data.supplier);
}
