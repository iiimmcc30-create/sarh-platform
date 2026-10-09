import fs from 'fs';
import path from 'path';
// Same module instance jest maps 'expo-location' to.
import { __mock as locationMock } from './mocks/expo-location';
import {
  formatDistanceKm,
  haversineKm,
  matchSaudiCityName,
  nearestSaudiCity,
  normalizeCityName,
  roundCoord2,
  saudiCityById,
  searchSaudiCities,
} from '@/lib/saudiCities';
import { SAUDI_CITIES, SAUDI_CITY_REGIONS } from '@/constants/saudiCities.generated';
import { SAUDI_REGIONS } from '@/constants/saudiRegions';
import { __resetDeviceCityCache, detectDeviceCity, resolveDevicePoint } from '@/lib/deviceCity';
import {
  applyNearbyChip,
  initialNearbyState,
  nearbyApiParams,
  nearbyChips,
  nearbyOriginLabel,
} from '@/lib/nearbyFeed';
import { buildListingsFeedUrl, isDefaultListingsFirstPage } from '@/services/listings';
import {
  buildCategorySections,
  buildRegionSections,
  isCitySelected,
  isRegionSelected,
} from '@/lib/pickerSections';
import type { MarketCategory } from '@/services/categories';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const city = (id: string) => saudiCityById(id)!;

describe('shared Saudi city table (generated from backend JSON)', () => {
  it('matches the backend dataset one-to-one', () => {
    const json = JSON.parse(src('../backend-nest/assets/geo/saudi-cities.json'));
    expect(SAUDI_CITIES).toHaveLength(json.cities.length);
    expect(SAUDI_CITY_REGIONS).toHaveLength(13);
    expect(SAUDI_REGIONS.map((r) => r.id)).toEqual(SAUDI_CITY_REGIONS.map((r) => r.id));
    expect(SAUDI_REGIONS.find((r) => r.id === 'jazan')!.nameAr).toBe('منطقة جازان');
  });

  it('normalizes Arabic place names like the backend', () => {
    expect(normalizeCityName('المزاحميّة')).toBe(normalizeCityName('المزاحميه'));
    expect(normalizeCityName('حفر الباطن')).toBe(normalizeCityName('حفرالباطن'));
    expect(normalizeCityName('محافظة الأسياح')).toBe(normalizeCityName('الاسياح'));
  });

  it('resolves live listing texts to cities', () => {
    expect(matchSaudiCityName('الرس')!.id).toBe('rass');
    expect(matchSaudiCityName('ضرماء')!.id).toBe('duruma');
    expect(matchSaudiCityName('عقلة الصقور')!.id).toBe('uqlat-assuqur');
    expect(matchSaudiCityName('الهفوف')!.id).toBe('ahsa');
    expect(matchSaudiCityName('مكان مجهول')).toBeNull();
  });

  it('search ranks exact, then prefix, then contains', () => {
    expect(searchSaudiCities('الرس')[0].id).toBe('rass');
    expect(searchSaudiCities('بريد')[0].id).toBe('buraidah');
    expect(searchSaudiCities('').length).toBe(SAUDI_CITIES.length);
  });

  it('nearest city by haversine on the device', () => {
    const rass = city('rass');
    expect(nearestSaudiCity(rass.lat + 0.02, rass.lng - 0.02)!.city.id).toBe('rass');
    expect(haversineKm(25, 45, 26, 45)).toBeCloseTo(111.2, 0);
    expect(roundCoord2(25.86849)).toBe(25.87);
    expect(formatDistanceKm(35)).toBe('~35 كم');
    expect(formatDistanceKm(undefined)).toBeNull();
  });
});

describe('device city (expo-location, permission flow)', () => {
  beforeEach(() => {
    __resetDeviceCityCache();
    locationMock.permission = { status: 'granted', canAskAgain: true };
    locationMock.position = null;
  });

  it('rounds the GPS point to 2 decimals and picks the nearest city', async () => {
    locationMock.position = { coords: { latitude: 26.33912, longitude: 43.96543 } };
    const r = await detectDeviceCity({ useCache: false });
    expect(r).toMatchObject({ status: 'ok', lat: 26.34, lng: 43.97 });
    expect(r.status === 'ok' && r.city.id).toBe('buraidah');
  });

  it('denied → caller falls back to the city picker', async () => {
    locationMock.permission = { status: 'denied', canAskAgain: false };
    expect(await detectDeviceCity({ useCache: false })).toEqual({ status: 'denied', canAskAgain: false });
  });

  it('far outside KSA → outside; no position → unavailable', async () => {
    expect(resolveDevicePoint(48.85, 2.35)).toEqual({ status: 'outside' });
    expect(await detectDeviceCity({ useCache: false })).toEqual({ status: 'unavailable' });
  });
});

describe('«القريب» filter chips and API params', () => {
  const gps = initialNearbyState({ kind: 'gps', lat: 25.87, lng: 43.5, city: city('rass') });

  it('defaults to 50 km nearest-first with 4 radius chips + «الأقرب أولاً»', () => {
    const chips = nearbyChips(gps);
    expect(chips.map((c) => c.label)).toEqual(['25 كم', '50 كم', '100 كم', '200 كم', 'الأقرب أولاً']);
    expect(chips.filter((c) => c.selected).map((c) => c.key)).toEqual(['r50', 'nearest']);
    expect(nearbyOriginLabel(gps.origin)).toBe('قربك · الرس');
  });

  it('chips update radius and toggle the order', () => {
    const r100 = applyNearbyChip(gps, nearbyChips(gps).find((c) => c.key === 'r100')!);
    expect(r100.radiusKm).toBe(100);
    const newest = applyNearbyChip(r100, nearbyChips(r100).find((c) => c.kind === 'nearest')!);
    expect(newest.nearestFirst).toBe(false);
    expect(nearbyApiParams(newest)).toEqual({ near: { lat: 25.87, lng: 43.5 }, radiusKm: 100, sort: undefined });
  });

  it('builds the server query (no client-side text filter)', () => {
    const base = 'https://api.example';
    expect(buildListingsFeedUrl(base, nearbyApiParams(gps))).toBe(
      `${base}/api/listings?sort=nearest&near=25.87%2C43.50&radiusKm=50`,
    );
    const byCity = initialNearbyState({ kind: 'city', city: city('zulfi') });
    expect(buildListingsFeedUrl(base, nearbyApiParams(byCity))).toBe(
      `${base}/api/listings?sort=nearest&cityId=zulfi&radiusKm=50`,
    );
    expect(isDefaultListingsFirstPage(nearbyApiParams(byCity))).toBe(false);
    expect(nearbyApiParams(null)).toEqual({});
  });

  it('feed no longer scans pages / reverse-geocodes for «القريب»', () => {
    const feed = src('components/market/MarketListingsFeed.tsx');
    expect(feed).not.toContain('reverseGeocodeAsync');
    expect(feed).toContain('nearbyApiParams');
    expect(feed).toContain('<SaudiCityPickerSheet');
    expect(src('components/market/SaudiCityPickerSheet.tsx')).toContain('<SheetModal');
  });
});

describe('grouped picker sheets («كل المناطق» / «التصنيف»)', () => {
  it('region sections: every region with its cities, grouped', () => {
    const all = buildRegionSections('');
    expect(all).toHaveLength(13);
    expect(all.every((s) => s.showWholeRegion)).toBe(true);
    expect(all.reduce((n, s) => n + s.cities.length, 0)).toBe(SAUDI_CITIES.length);
  });

  it('search uses Arabic normalization and aliases', () => {
    const s = buildRegionSections('المزاحميه');
    expect(s).toHaveLength(1);
    expect(s[0].region.id).toBe('riyadh');
    expect(s[0].showWholeRegion).toBe(false);
    expect(s[0].cities.map((c) => c.id)).toContain('muzahmiyah');
    const q = buildRegionSections('القصيم');
    expect(q.find((x) => x.region.id === 'qassim')!.showWholeRegion).toBe(true);
  });

  it('selection checks', () => {
    const qassim = SAUDI_REGIONS.find((r) => r.id === 'qassim')!;
    const rass = qassim.cities.find((c) => c.id === 'rass')!;
    expect(isRegionSelected({ type: 'region', region: qassim }, qassim)).toBe(true);
    expect(isCitySelected({ type: 'city', region: qassim, city: rass } as never, rass)).toBe(true);
    expect(isCitySelected({ type: 'all' } as never, rass)).toBe(false);
  });

  it('category sections: parents by sortOrder with active breeds', () => {
    const cat = (id: string, nameAr: string, sortOrder: number, children: MarketCategory[] = [], isActive = true): MarketCategory => ({
      id, nameAr, slug: id, sortOrder, isActive, requiresWeight: false, children,
    });
    const cats = [
      cat('camels', 'إبل', 2, [cat('majaheem', 'مجاهيم', 1)]),
      cat('sheep', 'غنم', 1, [cat('naimi', 'نعيمي', 2), cat('najdi', 'نجدي', 1), cat('old', 'قديم', 0, [], false)]),
    ];
    const all = buildCategorySections(cats, '');
    expect(all.map((s) => s.parent.id)).toEqual(['sheep', 'camels']);
    expect(all[0].subs.map((s) => s.id)).toEqual(['najdi', 'naimi']);
    const q = buildCategorySections(cats, 'نجدى');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ showWholeParent: false });
    expect(q[0].subs.map((s) => s.id)).toEqual(['najdi']);
  });

  it('pickers use the large grouped sheet with reset + sticky search', () => {
    const sheet = src('components/ui/sheets/GroupedPickerSheet.tsx');
    expect(sheet).toContain('<SheetModal');
    expect(sheet).toContain('إعادة تعيين');
    // search lives above the list, so it stays put while sections scroll
    expect(sheet.indexOf('<TextInput')).toBeGreaterThan(-1);
    expect(sheet.indexOf('<TextInput')).toBeLessThan(sheet.indexOf('<SectionList'));
    for (const f of ['components/market/RegionCityPicker.tsx', 'components/market/MarketCategoryPicker.tsx']) {
      expect(src(f)).toContain('<GroupedPickerSheet');
    }
    expect(src('components/market/RegionCityPicker.tsx')).toContain('القريب مني');
  });
});
