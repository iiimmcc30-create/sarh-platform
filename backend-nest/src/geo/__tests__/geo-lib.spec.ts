import {
  locationCandidates,
  normalizeArabicPlace,
} from '../lib/arabic-place-normalize';
import {
  boundingBox,
  buildNearbyListingsSql,
  haversineKm,
  isInSaudiBounds,
  roundCoord,
  roundDistanceKm,
} from '../lib/geo-distance';
import {
  loadSaudiCitiesDataset,
  saudiCityMatcher,
} from '../lib/saudi-cities-dataset';
import { planListingGeoBackfill } from '../listing-geo-backfill.service';
import { InvalidCityError, resolveListingGeo } from '../lib/listing-geo-input';

describe('normalizeArabicPlace', () => {
  it.each([
    ['المزاحمية', 'المزاحميه'],
    ['حفر الباطن', 'حفرالباطن'],
    ['ضرماء', 'ضرما'],
    ['الرس', 'رس'],
    ['أبها', 'ابها'],
    ['محافظة الخرج', 'الخرج'],
    ['عُقْلَة الصُّقُور', 'عقلة الصقور'],
    ['بريـــدة', 'بريدة'],
    ['Ar Rass', 'rass'],
  ])('%s ≡ %s', (a, b) => {
    expect(normalizeArabicPlace(a)).toBe(normalizeArabicPlace(b));
    expect(normalizeArabicPlace(a)).not.toBe('');
  });

  it('splits free text into candidates', () => {
    expect(locationCandidates('الرس، القصيم')).toEqual([
      'الرس، القصيم',
      'الرس',
      'القصيم',
    ]);
    expect(locationCandidates('')).toEqual([]);
  });
});

describe('Saudi city dataset', () => {
  const data = loadSaudiCitiesDataset();
  const matcher = saudiCityMatcher();

  it('has ~200 cities in 13 regions, unique ids, coords inside KSA', () => {
    expect(data.regions).toHaveLength(13);
    expect(data.cities.length).toBeGreaterThanOrEqual(170);
    const ids = new Set(data.cities.map((c) => c.id));
    expect(ids.size).toBe(data.cities.length);
    const regionIds = new Set(data.regions.map((r) => r.id));
    for (const c of data.cities) {
      expect(regionIds.has(c.regionId)).toBe(true);
      expect(isInSaudiBounds(c.lat, c.lng)).toBe(true);
    }
    for (const r of data.regions) expect(ids.has(r.capitalId)).toBe(true);
  });

  it('no two cities share a normalized name/alias', () => {
    const seen = new Map<string, string>();
    for (const c of data.cities) {
      for (const n of new Set(
        [c.nameAr, ...c.aliases].map(normalizeArabicPlace),
      )) {
        if (!n) continue;
        expect({ n, other: seen.get(n) ?? c.id }).toEqual({ n, other: c.id });
        seen.set(n, c.id);
      }
    }
  });

  it.each([
    ['الرس', 'rass'],
    ['الدوادمي', 'dawadmi'],
    ['الدمام', 'dammam'],
    ['الزلفي', 'zulfi'],
    ['ضرماء', 'duruma'],
    ['المزاحميه', 'muzahmiyah'],
    ['حفرالباطن', 'hafr-albatin'],
    ['عقلة الصقور', 'uqlat-assuqur'],
    ['الاحساء', 'ahsa'],
    ['محافظة الأسياح', 'asyah'],
  ])('matches %s → %s', (text, id) => {
    expect(matcher.match(text)?.city.id).toBe(id);
  });

  it('region-only text maps to the region capital, city text wins over region', () => {
    expect(matcher.match('القصيم')).toMatchObject({
      via: 'region',
      city: { id: 'buraidah' },
    });
    expect(matcher.match('الرس، القصيم')).toMatchObject({
      via: 'city',
      city: { id: 'rass' },
    });
    expect(matcher.match('حي النخيل بريدة')?.city.id).toBe('buraidah');
    expect(matcher.match('مكان غير معروف')).toBeNull();
  });

  it('nearest city by haversine', () => {
    const rass = matcher.byId.get('rass')!;
    expect(matcher.nearest(rass.lat + 0.01, rass.lng - 0.01)?.city.id).toBe(
      'rass',
    );
  });
});

describe('distance helpers', () => {
  it('uses the governorate seats, not same-name villages (audit regressions)', () => {
    const m = saudiCityMatcher();
    const near = (id: string, lat: number, lng: number) =>
      haversineKm(m.byId.get(id)!.lat, m.byId.get(id)!.lng, lat, lng);
    expect(near('hariq', 23.6336, 46.5139)).toBeLessThan(2); // not الحريق village near Shaqra
    expect(near('harjah', 17.9218, 43.3677)).toBeLessThan(2); // not الحرجة village near Balqarn
  });

  it('haversine is accurate (Makkah ↔ Madinah ≈ 337 km great-circle)', () => {
    const m = saudiCityMatcher();
    const r = m.byId.get('makkah-city')!;
    const b = m.byId.get('madinah-city')!;
    const km = haversineKm(r.lat, r.lng, b.lat, b.lng);
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(345);
    // 1° of latitude ≈ 111.2 km
    expect(haversineKm(25, 45, 26, 45)).toBeCloseTo(111.2, 0);
    expect(haversineKm(r.lat, r.lng, r.lat, r.lng)).toBe(0);
  });

  it('bounding box contains the radius circle', () => {
    const box = boundingBox(26, 44, 50);
    for (const [dLat, dLng] of [
      [0.44, 0],
      [-0.44, 0],
      [0, 0.49],
      [0, -0.49],
    ]) {
      const lat = 26 + dLat;
      const lng = 44 + dLng;
      expect(haversineKm(26, 44, lat, lng)).toBeLessThan(50);
      expect(lat).toBeGreaterThanOrEqual(box.minLat);
      expect(lat).toBeLessThanOrEqual(box.maxLat);
      expect(lng).toBeGreaterThanOrEqual(box.minLng);
      expect(lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it.each([
    [0.2, 1],
    [3.4, 3],
    [9.6, 10],
    [12.4, 10],
    [33, 35],
    [37.4, 35],
    [187.6, 190],
  ])('roundDistanceKm(%s) = %s', (km, out) => {
    expect(roundDistanceKm(km)).toBe(out);
  });

  it('roundCoord keeps 2 decimals', () => {
    expect(roundCoord(25.869441)).toBe(25.87);
    expect(roundCoord(43.497312)).toBe(43.5);
  });
});

describe('buildNearbyListingsSql', () => {
  it('is fully parameterized, box-prefiltered, ordered by distance then id', () => {
    const sql = buildNearbyListingsSql({
      lat: 25.87,
      lng: 43.5,
      radiusKm: 50,
      limit: 101,
      cursorId: 'x\'; DROP TABLE "Listing"; --',
    });
    expect(Array.isArray(sql.values)).toBe(true);
    expect(sql.sql).not.toContain('25.87');
    expect(sql.sql).not.toContain('DROP TABLE');
    expect(sql.values).toContain('x\'; DROP TABLE "Listing"; --');
    expect(sql.values).toContain(50);
    expect(sql.values).toContain(101);
    expect(sql.text).toMatch(
      /l\."lat" BETWEEN \$\d+::float8 AND \$\d+::float8/,
    );
    expect(sql.sql).toMatch(/l\."lng" BETWEEN/);
    expect(sql.sql).toContain('asin(');
    expect(sql.sql).toMatch(/ORDER BY n\.distance_km ASC, n\.id ASC/);
    expect(sql.sql).toMatch(/\(n\.distance_km, n\.id\) >/);
    expect(sql.sql).toContain(`l."deletedAt" IS NULL`);
  });

  it('newest order pages on (createdAt, id) DESC', () => {
    const sql = buildNearbyListingsSql({
      lat: 25,
      lng: 45,
      radiusKm: 25,
      limit: 10,
      order: 'newest',
      cursorId: 'abc',
    });
    expect(sql.sql).toMatch(/ORDER BY n\.created_at DESC, n\.id DESC/);
    expect(sql.sql).toMatch(/\(n\.created_at, n\.id\) </);
  });
});

describe('listing geo input + backfill plan', () => {
  const m = saudiCityMatcher();

  it('validates cityId and uses the city centre unless GPS is close to it', () => {
    const rass = m.byId.get('rass')!;
    expect(resolveListingGeo(m, { cityId: 'rass' }, [])).toEqual({
      cityId: 'rass',
      lat: rass.lat,
      lng: rass.lng,
      geoSource: 'CITY',
    });
    expect(
      resolveListingGeo(
        m,
        {
          cityId: 'rass',
          lat: rass.lat + 0.0412,
          lng: rass.lng,
          geoSource: 'GPS',
        },
        [],
      ),
    ).toEqual({
      cityId: 'rass',
      lat: Math.round((rass.lat + 0.0412) * 100) / 100,
      lng: Math.round(rass.lng * 100) / 100,
      geoSource: 'GPS',
    });
    // GPS in Riyadh while the city says الرس → city centre.
    expect(
      resolveListingGeo(
        m,
        { cityId: 'rass', lat: 24.7, lng: 46.7, geoSource: 'GPS' },
        [],
      )?.geoSource,
    ).toBe('CITY');
    expect(() => resolveListingGeo(m, { cityId: 'nope' }, [])).toThrow(
      InvalidCityError,
    );
    expect(resolveListingGeo(m, {}, ['الزلفي'])?.cityId).toBe('zulfi');
    expect(resolveListingGeo(m, {}, ['؟؟'])).toBeNull();
  });

  it('maps the 9 live listings', () => {
    const live = [
      'الرس',
      'الدوادمي',
      'الدمام',
      'الزلفي',
      'ضرماء',
      'المزاحميه',
      'القصيم',
      'حفرالباطن',
      'عقلة الصقور',
    ];
    const plan = planListingGeoBackfill(
      m,
      live.map((t, i) => ({
        id: `l${i}`,
        arabicLocation: t,
        displayRegion: null,
        location: t,
      })),
    );
    expect(plan.unmatched).toEqual([]);
    expect(plan.updates.map((u) => u.cityId)).toEqual([
      'rass',
      'dawadmi',
      'dammam',
      'zulfi',
      'duruma',
      'muzahmiyah',
      'buraidah',
      'hafr-albatin',
      'uqlat-assuqur',
    ]);
    expect(plan.updates[6].via).toBe('region');
  });
});
