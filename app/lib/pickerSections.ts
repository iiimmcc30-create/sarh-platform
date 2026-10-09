import type { RegionSelection, SaudiCity, SaudiRegion } from '@/constants/saudiRegions';
import { SAUDI_REGIONS } from '@/constants/saudiRegions';
import type { MarketCategory } from '@/services/categories';
import { normalizeCityName, saudiCityById } from '@/lib/saudiCities';

/** Normalized search key shared by both pickers (ة/ه, أ/ا, ال, spaces, diacritics). */
export const pickerKey = normalizeCityName;

function matches(query: string, names: Array<string | null | undefined>): boolean {
  const q = pickerKey(query);
  if (!q) return true;
  return names.some((n) => {
    const k = pickerKey(n);
    return !!k && k.includes(q);
  });
}

export function regionShortName(region: SaudiRegion): string {
  return region.nameAr.replace(/^منطقة\s/, '').replace(/^المنطقة\s/, '');
}

export type RegionSection = {
  region: SaudiRegion;
  title: string;
  /** «كل مدن …» row: shown unless the search only hit some cities. */
  showWholeRegion: boolean;
  cities: SaudiCity[];
};

/**
 * Region picker sections: each region (small grey header) with its whole-region row and
 * its cities. Search keeps a region when its name matches (all cities) or only the
 * matching cities otherwise; aliases (المزاحميه, حفرالباطن…) match too.
 */
export function buildRegionSections(query: string): RegionSection[] {
  const q = pickerKey(query);
  const out: RegionSection[] = [];
  for (const region of SAUDI_REGIONS) {
    const title = regionShortName(region);
    if (!q) {
      out.push({ region, title, showWholeRegion: true, cities: region.cities });
      continue;
    }
    const regionHit = matches(query, [region.nameAr, region.nameEn, title]);
    const cities = regionHit
      ? region.cities
      : region.cities.filter((c) =>
          matches(query, [c.nameAr, c.nameEn, ...(saudiCityById(c.id)?.aliases ?? [])]),
        );
    if (regionHit || cities.length > 0) {
      out.push({ region, title, showWholeRegion: regionHit, cities });
    }
  }
  return out;
}

export function isRegionSelected(selection: RegionSelection, region: SaudiRegion): boolean {
  return selection.type === 'region' && selection.region.id === region.id;
}

export function isCitySelected(selection: RegionSelection, city: SaudiCity): boolean {
  return selection.type === 'city' && selection.city.id === city.id;
}

export type CategorySelection = { parentId: string | null; subId: string | null };

export type CategorySection = {
  parent: MarketCategory;
  /** «كل …» row selecting the whole parent (subId null). */
  showWholeParent: boolean;
  subs: MarketCategory[];
};

/** Active parents by sortOrder, each with its active subcategories (breeds), filtered by search. */
export function buildCategorySections(
  categories: MarketCategory[],
  query: string,
): CategorySection[] {
  const parents = categories
    .filter((c) => c.isActive !== false)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const out: CategorySection[] = [];
  for (const parent of parents) {
    const subs = (parent.children ?? [])
      .filter((c) => c.isActive !== false)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const parentHit = matches(query, [parent.nameAr, parent.nameEn, parent.slug]);
    const hitSubs = parentHit ? subs : subs.filter((s) => matches(query, [s.nameAr, s.nameEn, s.slug]));
    if (parentHit || hitSubs.length > 0) {
      out.push({ parent, showWholeParent: parentHit, subs: hitSubs });
    }
  }
  return out;
}
