import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import { PaidServicesService } from '../settings/paid-services.service';
import {
  DEFAULT_HOME_EXPLORE_DESTINATIONS,
  getExploreCatalogEntry,
  HOME_EXPLORE_CATALOG,
  HOME_EXPLORE_SETTING_KEY,
  isExploreDestinationKey,
  type HomeExploreDestinationKey,
} from './home-explore.catalog';

export type HomeExploreStoredItem = {
  id: string;
  destination: HomeExploreDestinationKey;
  sortOrder: number;
  isActive: boolean;
};

@Injectable()
export class HomeExploreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidServices: PaidServicesService,
  ) {}

  private hydrate(item: HomeExploreStoredItem) {
    const meta = getExploreCatalogEntry(item.destination);
    if (!meta) return null;
    return {
      id: item.id,
      destination: item.destination,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      titleAr: meta.titleAr,
      descriptionAr: meta.descriptionAr,
      icon: meta.icon,
      route: meta.route,
      requiresPaidServices: Boolean(meta.requiresPaidServices),
    };
  }

  private async readStore(): Promise<HomeExploreStoredItem[]> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: HOME_EXPLORE_SETTING_KEY },
    });
    if (!row) {
      return this.seedDefaults();
    }
    const value = row.value as
      { items?: HomeExploreStoredItem[] } | HomeExploreStoredItem[];
    const items = Array.isArray(value) ? value : value?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return this.seedDefaults();
    }
    return items
      .filter((item) => item && isExploreDestinationKey(item.destination))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async writeStore(items: HomeExploreStoredItem[]) {
    const normalized = items.map((item, index) => ({
      ...item,
      sortOrder: index,
    }));
    await this.prisma.appSetting.upsert({
      where: { key: HOME_EXPLORE_SETTING_KEY },
      create: {
        key: HOME_EXPLORE_SETTING_KEY,
        value: { items: normalized },
        labelAr: 'أقسام استكشف سرح',
        category: 'home',
      },
      update: {
        value: { items: normalized },
        labelAr: 'أقسام استكشف سرح',
        category: 'home',
      },
    });
    return normalized;
  }

  private async seedDefaults(): Promise<HomeExploreStoredItem[]> {
    const items = DEFAULT_HOME_EXPLORE_DESTINATIONS.map(
      (destination, index) => ({
        id: randomUUID(),
        destination,
        sortOrder: index,
        isActive: destination !== 'promote',
      }),
    );
    return this.writeStore(items);
  }

  catalog(includePromote: boolean) {
    return HOME_EXPLORE_CATALOG.filter(
      (item) => includePromote || !item.requiresPaidServices,
    );
  }

  async listPublic() {
    const [items, flags] = await Promise.all([
      this.readStore(),
      this.paidServices.getFlags(),
    ]);
    const paidOn =
      flags.promotionEnabled || flags.pinEnabled || flags.featureEnabled;
    return items
      .filter((item) => item.isActive)
      .map((item) => this.hydrate(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => paidOn || !item.requiresPaidServices);
  }

  async listAdmin() {
    const items = await this.readStore();
    return items
      .map((item) => this.hydrate(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async add(destination: string) {
    if (!isExploreDestinationKey(destination)) {
      throwApi(400, 'invalid_destination', 'القسم غير معروف');
    }
    const items = await this.readStore();
    if (items.some((item) => item.destination === destination)) {
      throwApi(409, 'already_added', 'هذا القسم مضاف مسبقاً');
    }
    const flags = await this.paidServices.getFlags();
    const paidOn =
      flags.promotionEnabled || flags.pinEnabled || flags.featureEnabled;
    const meta = getExploreCatalogEntry(destination)!;
    if (meta.requiresPaidServices && !paidOn) {
      throwApi(403, 'service_disabled', 'تعزيز سرح غير مفعّل في لوحة التحكم');
    }
    items.push({
      id: randomUUID(),
      destination,
      sortOrder: items.length,
      isActive: true,
    });
    const stored = await this.writeStore(items);
    return stored.map((item) => this.hydrate(item)).filter(Boolean);
  }

  async update(id: string, patch: { isActive?: boolean; sortOrder?: number }) {
    const items = await this.readStore();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throwApi(404, 'not_found', 'القسم غير موجود');
    if (typeof patch.isActive === 'boolean') {
      items[index].isActive = patch.isActive;
    }
    if (
      typeof patch.sortOrder === 'number' &&
      Number.isFinite(patch.sortOrder)
    ) {
      const next = items[index];
      items.splice(index, 1);
      const target = Math.max(
        0,
        Math.min(items.length, Math.round(patch.sortOrder)),
      );
      items.splice(target, 0, next);
    }
    const stored = await this.writeStore(items);
    return stored.map((item) => this.hydrate(item)).filter(Boolean);
  }

  async reorder(orderedIds: string[]) {
    const items = await this.readStore();
    const byId = new Map(items.map((item) => [item.id, item]));
    const next: HomeExploreStoredItem[] = [];
    for (const id of orderedIds) {
      const item = byId.get(id);
      if (item) {
        next.push(item);
        byId.delete(id);
      }
    }
    for (const leftover of byId.values()) next.push(leftover);
    const stored = await this.writeStore(next);
    return stored.map((item) => this.hydrate(item)).filter(Boolean);
  }

  async remove(id: string) {
    const items = await this.readStore();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) {
      throwApi(404, 'not_found', 'القسم غير موجود');
    }
    const stored = await this.writeStore(next);
    return stored.map((item) => this.hydrate(item)).filter(Boolean);
  }
}
