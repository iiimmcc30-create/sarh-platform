import { MARKET_CATEGORIES_FALLBACK } from '@/lib/marketCategoriesFallback';
import { ensureApiReachable } from './api';
import { dedupeInflight } from './requestCoordination';

export type MarketCategory = {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  slug: string;
  icon?: string | null;
  emoji?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresWeight: boolean;
  legacyCategory?: string | null;
  children?: MarketCategory[];
};

let categoriesApiAvailable: boolean | null = null;
const CATEGORIES_TTL_MS = 60_000;
let categoriesCache: { at: number; data: MarketCategory[] } | null = null;

/** Whether the last fetch hit a live /api/categories endpoint. */
export function isCategoriesApiAvailable(): boolean {
  return categoriesApiAvailable === true;
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  return json.data as T;
}

function cloneFallback(): MarketCategory[] {
  return MARKET_CATEGORIES_FALLBACK.map((p) => ({
    ...p,
    children: p.children?.map((c) => ({ ...c })),
  }));
}

export async function fetchMarketCategories(
  options?: { force?: boolean },
): Promise<MarketCategory[]> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && categoriesCache && now - categoriesCache.at < CATEGORIES_TTL_MS) {
    return categoriesCache.data;
  }

  return dedupeInflight('GET:/api/categories', async () => {
    const base = await ensureApiReachable();
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/categories`, {
        cache: 'no-store',
      });
      const data = await readJson<{ categories: MarketCategory[] }>(res);
      if (data?.categories?.length) {
        categoriesApiAvailable = true;
        categoriesCache = { at: Date.now(), data: data.categories };
        return data.categories;
      }
      if (res.status === 404) {
        categoriesApiAvailable = false;
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[categories] fetchMarketCategories failed:', err);
      }
    }

    categoriesApiAvailable = false;
    if (__DEV__) {
      console.warn(
        '[categories] /api/categories unavailable — using bundled taxonomy. Deploy backend + migration for live data.',
      );
    }
    if (categoriesCache?.data?.length) return categoriesCache.data;
    return cloneFallback();
  });
}

export async function fetchMarketCategory(id: string): Promise<MarketCategory | null> {
  const tree = await fetchMarketCategories();
  for (const root of tree) {
    if (root.id === id) return root;
    const child = root.children?.find((c) => c.id === id);
    if (child) return { ...child, children: [] };
  }

  const base = await ensureApiReachable();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/categories/${id}`, {
      cache: 'no-store',
    });
    const data = await readJson<{ category: MarketCategory }>(res);
    return data?.category ?? null;
  } catch {
    return null;
  }
}

export async function fetchMarketSubcategories(id: string): Promise<MarketCategory[]> {
  const tree = await fetchMarketCategories();
  const parent = tree.find((c) => c.id === id);
  if (parent?.children?.length) {
    return parent.children.filter((c) => c.isActive);
  }

  const base = await ensureApiReachable();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/categories/${id}/subcategories`, {
      cache: 'no-store',
    });
    const data = await readJson<{ subcategories: MarketCategory[] }>(res);
    return data?.subcategories ?? [];
  } catch {
    return [];
  }
}
