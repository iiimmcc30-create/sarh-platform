import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { BadgeVisibilityPrefs, HiddenBadgeMap } from './badge-visibility';

/** Short TTL: another API instance picks up a toggle within this window. */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class BadgeVisibilityService {
  private cache: { at: number; map: Map<string, BadgeVisibilityPrefs> } | null =
    null;
  private inflight: Promise<Map<string, BadgeVisibilityPrefs>> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Users that hide their badge or gold label (a small set: subscribers only). */
  async hiddenMap(now = Date.now()): Promise<HiddenBadgeMap> {
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.map;
    this.inflight ??= this.load()
      .then((map) => {
        this.cache = { at: Date.now(), map };
        return map;
      })
      .catch(() => this.cache?.map ?? new Map<string, BadgeVisibilityPrefs>())
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async load(): Promise<Map<string, BadgeVisibilityPrefs>> {
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [{ hideVerifiedBadge: true }, { hideGoldSellerLabel: true }],
      },
      select: { id: true, hideVerifiedBadge: true, hideGoldSellerLabel: true },
      take: 20_000,
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          hideVerifiedBadge: r.hideVerifiedBadge,
          hideGoldSellerLabel: r.hideGoldSellerLabel,
        },
      ]),
    );
  }

  invalidate() {
    this.cache = null;
  }

  async getPrefs(userId: string): Promise<BadgeVisibilityPrefs> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hideVerifiedBadge: true, hideGoldSellerLabel: true },
    });
    return {
      hideVerifiedBadge: row?.hideVerifiedBadge ?? false,
      hideGoldSellerLabel: row?.hideGoldSellerLabel ?? false,
    };
  }

  async updatePrefs(
    userId: string,
    patch: Partial<BadgeVisibilityPrefs>,
  ): Promise<BadgeVisibilityPrefs> {
    const data: Partial<BadgeVisibilityPrefs> = {};
    if (typeof patch.hideVerifiedBadge === 'boolean') {
      data.hideVerifiedBadge = patch.hideVerifiedBadge;
    }
    if (typeof patch.hideGoldSellerLabel === 'boolean') {
      data.hideGoldSellerLabel = patch.hideGoldSellerLabel;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
      this.invalidate();
    }
    return this.getPrefs(userId);
  }
}
