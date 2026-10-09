import {
  locationCandidates,
  normalizeArabicPlace,
} from './arabic-place-normalize';
import { haversineKm } from './geo-distance';

export type SaudiCityRecord = {
  id: string;
  regionId: string;
  nameAr: string;
  nameEn: string;
  aliases: string[];
  lat: number;
  lng: number;
};

export type SaudiRegionRecord = {
  id: string;
  nameAr: string;
  nameEn: string;
  capitalId: string;
  aliases: string[];
};

export type SaudiCitiesDataset = {
  version: number;
  sources: string[];
  regions: SaudiRegionRecord[];
  cities: SaudiCityRecord[];
};

export type CityMatch = {
  city: SaudiCityRecord;
  /** city: a city/alias name matched; region: only a region name matched (→ its capital). */
  via: 'city' | 'region';
};

/** Normalized alias → city lookup for one dataset. */
export class SaudiCityMatcher {
  private readonly byKey = new Map<string, SaudiCityRecord>();
  private readonly regionKey = new Map<string, SaudiCityRecord>();
  readonly byId = new Map<string, SaudiCityRecord>();

  constructor(readonly dataset: SaudiCitiesDataset) {
    for (const c of dataset.cities) {
      this.byId.set(c.id, c);
      for (const name of [c.nameAr, c.nameEn, ...c.aliases]) {
        const k = normalizeArabicPlace(name);
        if (k && !this.byKey.has(k)) this.byKey.set(k, c);
      }
    }
    for (const r of dataset.regions) {
      const capital = this.byId.get(r.capitalId);
      if (!capital) continue;
      for (const name of [r.nameAr, r.nameEn, ...r.aliases]) {
        const k = normalizeArabicPlace(name);
        if (k && !this.byKey.has(k) && !this.regionKey.has(k)) {
          this.regionKey.set(k, capital);
        }
      }
    }
  }

  /** Exact normalized match of one name (city aliases only). */
  matchName(name: string | null | undefined): SaudiCityRecord | null {
    const k = normalizeArabicPlace(name);
    return k ? (this.byKey.get(k) ?? null) : null;
  }

  /**
   * Best city for free-text location fields, tried in order. City names win over
   * region names anywhere in the input; region-only text maps to the region capital.
   */
  match(...texts: Array<string | null | undefined>): CityMatch | null {
    const pieces: string[] = [];
    for (const t of texts)
      for (const p of locationCandidates(t)) pieces.push(p);

    for (const p of pieces) {
      const c = this.matchName(p);
      if (c) return { city: c, via: 'city' };
    }
    // Word n-grams inside a piece ("حي النخيل بريدة", "سوق الماشية بالرس" is not split).
    for (const p of pieces) {
      const words = p.split(/\s+/).filter(Boolean);
      for (const n of [3, 2, 1]) {
        for (let i = 0; i + n <= words.length; i += 1) {
          const gram = words.slice(i, i + n).join(' ');
          if (normalizeArabicPlace(gram).length < 3) continue;
          const c = this.matchName(gram);
          if (c) return { city: c, via: 'city' };
        }
      }
    }
    for (const p of pieces) {
      const k = normalizeArabicPlace(p);
      const c = k ? this.regionKey.get(k) : undefined;
      if (c) return { city: c, via: 'region' };
    }
    return null;
  }

  nearest(
    lat: number,
    lng: number,
  ): { city: SaudiCityRecord; km: number } | null {
    let best: { city: SaudiCityRecord; km: number } | null = null;
    for (const c of this.dataset.cities) {
      const km = haversineKm(lat, lng, c.lat, c.lng);
      if (!best || km < best.km) best = { city: c, km };
    }
    return best;
  }
}
