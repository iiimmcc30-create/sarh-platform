import { SaudiCitiesService } from '../geo/saudi-cities.service';
import { PRISMA_GLOBAL_OMIT } from '../prisma/prisma.service';
import { sanitizeListingMedia } from '../shared/lib/media-url';
import { ListingsService, parseNearParam } from './listings.service';

type GeoRow = { id: string; distance_km: number };

describe('GET /listings radius mode («القريب منك»)', () => {
  // 45 listings with coordinates, ids l00..l44, 1.3 km apart.
  const geo: GeoRow[] = Array.from({ length: 45 }, (_, i) => ({
    id: `l${String(i).padStart(2, '0')}`,
    distance_km: 0.4 + i * 1.3,
  }));
  const full = (id: string) => ({
    id,
    lat: 25.87,
    lng: 43.5,
    cityId: 'rass',
    geoSource: 'GPS',
    images: [],
    createdAt: new Date('2026-10-01T00:00:00Z'),
    seller: { id: 's1', avatar: null },
  });
  const repo = {
    findNearbyIds: jest.fn(),
    filterIds: jest.fn(),
    findMany: jest.fn(),
  };
  const usersRepo = { findBlockedRelationshipIds: jest.fn().mockResolvedValue([]) };
  const cache = { get: jest.fn(), set: jest.fn() };
  let service: ListingsService;
  let hidden: Set<string>;

  beforeEach(() => {
    jest.clearAllMocks();
    hidden = new Set();
    repo.findNearbyIds.mockImplementation(async (sql: { values: unknown[] }) => {
      // Emulate the keyset: cursor id is the last string value when present.
      const strings = sql.values.filter((v) => typeof v === 'string') as string[];
      const cursor = strings.find((s) => /^l\d\d$/.test(s));
      const limit = sql.values[sql.values.length - 1] as number;
      const radius = 50;
      const rows = geo.filter((g) => g.distance_km <= radius);
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      return rows.slice(start, start + limit);
    });
    repo.filterIds.mockImplementation(async (where: { AND: Array<{ id?: { in: string[] } }> }) => {
      const ids = where.AND[1].id!.in;
      return ids.filter((id) => !hidden.has(id));
    });
    repo.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map(full),
    );
    service = new ListingsService(
      repo as never,
      usersRepo as never,
      cache as never,
      { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveSync: jest.fn().mockReturnValue(null) } as never,
      {} as never,
      { expireStalePromotions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      new SaudiCitiesService({} as never),
    );
  });

  it('parses near=lat,lng', () => {
    expect(parseNearParam('25.87,43.50')).toEqual({ lat: 25.87, lng: 43.5 });
    expect(parseNearParam(' 26 , 44 ')).toEqual({ lat: 26, lng: 44 });
    expect(parseNearParam('95,44')).toBeNull();
    expect(parseNearParam(undefined)).toBeNull();
  });

  it('pages nearest-first with an id cursor, rounded distanceKm, never lat/lng', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const page = (await service.list({
        near: '25.87,43.5',
        radiusKm: 50,
        sort: 'nearest',
        cursor,
      } as never)) as { listings: Array<Record<string, unknown>>; nextCursor: string | null; hasMore: boolean };
      for (const l of page.listings) {
        expect(l).not.toHaveProperty('lat');
        expect(l).not.toHaveProperty('lng');
        expect(typeof l.distanceKm).toBe('number');
        seen.push(l.id as string);
      }
      expect(JSON.stringify(page)).not.toMatch(/"lat"|"lng"/);
      if (!page.hasMore) break;
      cursor = page.nextCursor!;
    }
    const expected = geo.filter((g) => g.distance_km <= 50).map((g) => g.id);
    expect(seen).toEqual(expected);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('applies the normal filters per batch without breaking the order', async () => {
    hidden = new Set(['l01', 'l02', 'l05']);
    const page = (await service.list({ cityId: 'rass', sort: 'nearest' } as never)) as {
      listings: Array<{ id: string; distanceKm: number }>;
    };
    expect(page.listings.map((l) => l.id).slice(0, 4)).toEqual(['l00', 'l03', 'l04', 'l06']);
    expect(page.listings[0].distanceKm).toBe(1);
  });

  it('rejects an unknown cityId and nearest without an origin', async () => {
    await expect(service.list({ cityId: 'nowhere' } as never)).rejects.toMatchObject({
      error: 'invalid_city',
    });
    await expect(service.list({ sort: 'nearest' } as never)).rejects.toMatchObject({
      error: 'origin_required',
    });
  });
});

describe('listing coordinates never leave the API', () => {
  it('Prisma omits Listing.lat/lng globally', () => {
    expect(PRISMA_GLOBAL_OMIT.listing).toEqual({ lat: true, lng: true });
  });

  it('sanitizeListingMedia strips lat/lng as a second guard', () => {
    const out = sanitizeListingMedia({ id: 'x', images: [], lat: 1, lng: 2, cityId: 'rass' });
    expect(out).not.toHaveProperty('lat');
    expect(out).not.toHaveProperty('lng');
    expect(out).toHaveProperty('cityId', 'rass');
  });
});
