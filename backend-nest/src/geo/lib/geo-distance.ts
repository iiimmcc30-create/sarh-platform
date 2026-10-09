import { Prisma } from '@prisma/client';

export const EARTH_RADIUS_KM = 6371.0088;
export const NEARBY_RADII_KM = [25, 50, 100, 200] as const;
export type NearbyRadiusKm = (typeof NEARBY_RADII_KM)[number];
export const DEFAULT_NEARBY_RADIUS_KM: NearbyRadiusKm = 50;

/** Saudi Arabia (with margin): lat 16..33, lng 34..56. */
export function isInSaudiBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 15.5 &&
    lat <= 33 &&
    lng >= 34 &&
    lng <= 56.5
  );
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/** Lat/lng box that fully contains the circle (slightly generous, filtered exactly after). */
export function boundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): BoundingBox {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRad(lat)), 0.01);
  const dLng = dLat / cosLat;
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Public distance label value: whole km under 10 km (min 1), otherwise 5 km steps.
 * Coarse on purpose — never enough to triangulate a seller.
 */
export function roundDistanceKm(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  if (km < 10) return Math.max(1, Math.round(km));
  return Math.round(km / 5) * 5;
}

/** Coordinates the app may send for a listing: ~1 km grid (2 decimals). */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Haversine distance in SQL, in km, between the parameter point and "Listing".lat/lng. */
export function haversineSql(lat: number, lng: number): Prisma.Sql {
  return Prisma.sql`(2 * ${EARTH_RADIUS_KM}::float8 * asin(least(1, sqrt(
    power(sin(radians(l."lat" - ${lat}::float8) / 2), 2) +
    cos(radians(${lat}::float8)) * cos(radians(l."lat")) *
    power(sin(radians(l."lng" - ${lng}::float8) / 2), 2)
  ))))`;
}

export type NearbyOrder = 'distance' | 'newest';

export type NearbyQueryParams = {
  lat: number;
  lng: number;
  radiusKm: number;
  limit: number;
  /** distance: nearest first (then id). newest: createdAt DESC (then id DESC). */
  order?: NearbyOrder;
  /**
   * Id of the last listing of the previous page (same opaque id cursor as the main feed).
   * Its sort key is recomputed in SQL, so no distance value ever travels in the cursor.
   */
  cursorId?: string | null;
  /** Extra AND conditions on alias `l` (already parameterized). */
  extraWhere?: Prisma.Sql[];
};

export type NearbyRow = { id: string; distance_km: number };

/**
 * Ids + exact distance of active listings within `radiusKm`.
 * Bounding-box prefilter on ("lat","lng") (indexed) before the haversine; keyset
 * pagination on (distance, id) or (createdAt, id). Every value is a bound parameter.
 */
export function buildNearbyListingsSql(p: NearbyQueryParams): Prisma.Sql {
  const order: NearbyOrder = p.order ?? 'distance';
  const box = boundingBox(p.lat, p.lng, p.radiusKm);
  const dist = haversineSql(p.lat, p.lng);
  const conds: Prisma.Sql[] = [
    Prisma.sql`l."status" = 'active'`,
    Prisma.sql`l."deletedAt" IS NULL`,
    Prisma.sql`l."lat" IS NOT NULL`,
    Prisma.sql`l."lng" IS NOT NULL`,
    Prisma.sql`l."lat" BETWEEN ${box.minLat}::float8 AND ${box.maxLat}::float8`,
    Prisma.sql`l."lng" BETWEEN ${box.minLng}::float8 AND ${box.maxLng}::float8`,
    ...(p.extraWhere ?? []),
  ];
  const inner = Prisma.sql`SELECT l."id" AS id, l."createdAt" AS created_at, ${dist} AS distance_km
    FROM "Listing" l
    WHERE ${Prisma.join(conds, ' AND ')}`;
  const outerConds: Prisma.Sql[] = [
    Prisma.sql`n.distance_km <= ${p.radiusKm}::float8`,
  ];
  if (p.cursorId) {
    if (order === 'distance') {
      const cursorKey = Prisma.sql`(SELECT ${dist} FROM "Listing" l WHERE l."id" = ${p.cursorId} AND l."lat" IS NOT NULL AND l."lng" IS NOT NULL)`;
      outerConds.push(
        Prisma.sql`(n.distance_km, n.id) > (${cursorKey}, ${p.cursorId}::text)`,
      );
    } else {
      const cursorKey = Prisma.sql`(SELECT c."createdAt" FROM "Listing" c WHERE c."id" = ${p.cursorId})`;
      outerConds.push(
        Prisma.sql`(n.created_at, n.id) < (${cursorKey}, ${p.cursorId}::text)`,
      );
    }
  }
  const orderBy =
    order === 'distance'
      ? Prisma.sql`ORDER BY n.distance_km ASC, n.id ASC`
      : Prisma.sql`ORDER BY n.created_at DESC, n.id DESC`;
  return Prisma.sql`SELECT n.id, n.distance_km FROM (${inner}) n
    WHERE ${Prisma.join(outerConds, ' AND ')}
    ${orderBy}
    LIMIT ${p.limit}`;
}
