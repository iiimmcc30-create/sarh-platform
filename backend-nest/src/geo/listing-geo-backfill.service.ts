import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/services/logger.service';
import { SaudiCitiesService } from './saudi-cities.service';
import type { SaudiCityMatcher } from './lib/saudi-city-matcher';

export type BackfillRow = {
  id: string;
  arabicLocation: string | null;
  displayRegion: string | null;
  location: string | null;
};

export type BackfillPlan = {
  updates: Array<{
    id: string;
    cityId: string;
    lat: number;
    lng: number;
    via: 'city' | 'region';
  }>;
  unmatched: Array<{ id: string; text: string }>;
};

/** Pure planning step (unit-tested): text fields → city centre, or unmatched. */
export function planListingGeoBackfill(
  matcher: SaudiCityMatcher,
  rows: BackfillRow[],
): BackfillPlan {
  const plan: BackfillPlan = { updates: [], unmatched: [] };
  for (const r of rows) {
    const m = matcher.match(r.arabicLocation, r.displayRegion, r.location);
    if (m) {
      plan.updates.push({
        id: r.id,
        cityId: m.city.id,
        lat: m.city.lat,
        lng: m.city.lng,
        via: m.via,
      });
    } else {
      plan.unmatched.push({
        id: r.id,
        text: [r.arabicLocation, r.displayRegion, r.location]
          .filter(Boolean)
          .join(' | '),
      });
    }
  }
  return plan;
}

/**
 * Boot task of the API process (after `prisma migrate deploy` in the entrypoint):
 *  1) seed "SaudiCity" from assets/geo/saudi-cities.json (once per dataset version);
 *  2) give listings without any geo a city centre (geoSource=CITY) from their text
 *     location. Only rows with geoSource IS NULL are touched and the UPDATE re-checks
 *     it, so GPS coordinates are never overwritten. Unmatched names are logged.
 * Runs in the background; silently retries next boot when the DB is not migrated yet.
 * Also runnable on demand: `npm run geo:backfill`.
 */
@Injectable()
export class ListingGeoBackfillService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cities: SaudiCitiesService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.GEO_BOOT_BACKFILL === 'false'
    )
      return;
    setTimeout(() => {
      void this.runAtBoot();
    }, 3_000).unref?.();
  }

  private async runAtBoot() {
    try {
      const seeded = await this.cities.seed();
      if (seeded) {
        this.logger?.info(
          { event: 'SAUDI_CITIES_SEEDED', ...seeded },
          'Saudi cities seeded',
        );
      }
      await this.backfill();
    } catch (err) {
      this.logger?.warn(
        { event: 'LISTING_GEO_BACKFILL_SKIPPED', err: (err as Error)?.message },
        'Listing geo backfill skipped (DB not migrated yet?)',
      );
    }
  }

  async backfill(
    batchSize = 500,
  ): Promise<{ updated: number; unmatched: BackfillPlan['unmatched'] }> {
    let updated = 0;
    const unmatched: BackfillPlan['unmatched'] = [];
    let afterId: string | undefined;
    for (;;) {
      const rows: BackfillRow[] = await this.prisma.listing.findMany({
        where: {
          geoSource: null,
          lat: null,
          ...(afterId ? { id: { gt: afterId } } : {}),
        },
        select: {
          id: true,
          arabicLocation: true,
          displayRegion: true,
          location: true,
        },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (rows.length === 0) break;
      afterId = rows[rows.length - 1].id;
      const plan = planListingGeoBackfill(this.cities.matcher, rows);
      for (const u of plan.updates) {
        const res = await this.prisma.listing.updateMany({
          where: { id: u.id, geoSource: null, lat: null },
          data: { cityId: u.cityId, lat: u.lat, lng: u.lng, geoSource: 'CITY' },
        });
        updated += res.count;
      }
      unmatched.push(...plan.unmatched);
      if (rows.length < batchSize) break;
    }
    if (updated > 0 || unmatched.length > 0) {
      this.logger?.info(
        {
          event: 'LISTING_GEO_BACKFILL',
          updated,
          unmatchedCount: unmatched.length,
          unmatched: unmatched.slice(0, 50),
        },
        'Listing geo backfill',
      );
    }
    return { updated, unmatched };
  }
}
