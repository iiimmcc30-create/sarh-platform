import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { saudiCityMatcher } from './lib/saudi-cities-dataset';
import type { SaudiCityMatcher } from './lib/saudi-city-matcher';

export const SAUDI_CITIES_VERSION_SETTING_KEY = 'geo.saudiCitiesVersion';

/** Reference data access + idempotent seeding of the "SaudiCity" table. */
@Injectable()
export class SaudiCitiesService {
  constructor(private readonly prisma: PrismaService) {}

  get matcher(): SaudiCityMatcher {
    return saudiCityMatcher();
  }

  /**
   * Upserts every city of the committed JSON once per dataset version (by id).
   * Rows are never deleted: a city dropped from the JSON keeps its row so listing
   * cityIds stay valid. Returns null when this version was already seeded.
   */
  async seed(): Promise<{ upserted: number; version: number } | null> {
    const dataset = this.matcher.dataset;
    const current = await this.prisma.appSetting.findUnique({
      where: { key: SAUDI_CITIES_VERSION_SETTING_KEY },
    });
    const seeded = Number(current?.value ?? 0);
    const tableCount = await this.prisma.saudiCity.count();
    if (
      Number.isFinite(seeded) &&
      seeded >= dataset.version &&
      tableCount >= dataset.cities.length
    ) {
      return null;
    }
    let order = 0;
    for (const c of dataset.cities) {
      order += 1;
      const data = {
        regionId: c.regionId,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        aliases: c.aliases,
        lat: c.lat,
        lng: c.lng,
        sortOrder: order,
      };
      await this.prisma.saudiCity.upsert({
        where: { id: c.id },
        create: { id: c.id, ...data },
        update: data,
      });
    }
    await this.prisma.appSetting.upsert({
      where: { key: SAUDI_CITIES_VERSION_SETTING_KEY },
      create: {
        key: SAUDI_CITIES_VERSION_SETTING_KEY,
        value: dataset.version,
        labelAr: 'إصدار بيانات المدن السعودية',
        category: 'geo',
      },
      update: { value: dataset.version },
    });
    return { upserted: dataset.cities.length, version: dataset.version };
  }
}
