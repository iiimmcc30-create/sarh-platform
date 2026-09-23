import { Injectable } from '@nestjs/common';
import { BoostType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import {
  DEFAULT_PAID_SERVICE_FLAGS,
  PAID_SERVICE_SETTING_DEFAULTS,
  PAID_SERVICE_SETTING_KEYS,
  type PaidServiceFlags,
} from './paid-services.constants';

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

@Injectable()
export class PaidServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert the four toggles if missing (does not overwrite admin changes). */
  ensureDefaults() {
    return Promise.all(
      PAID_SERVICE_SETTING_DEFAULTS.map((s) =>
        this.prisma.appSetting.upsert({
          where: { key: s.key },
          create: {
            key: s.key,
            value: s.value,
            labelAr: s.labelAr,
            category: s.category,
          },
          update: {},
        }),
      ),
    );
  }

  async getFlags(): Promise<PaidServiceFlags> {
    await this.ensureDefaults();
    const keys = Object.values(PAID_SERVICE_SETTING_KEYS);
    const rows = await this.prisma.appSetting.findMany({
      take: Math.max(keys.length, 1),
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
      promotionEnabled: asBool(
        map.get(PAID_SERVICE_SETTING_KEYS.promotion),
        DEFAULT_PAID_SERVICE_FLAGS.promotionEnabled,
      ),
      pinEnabled: asBool(
        map.get(PAID_SERVICE_SETTING_KEYS.pin),
        DEFAULT_PAID_SERVICE_FLAGS.pinEnabled,
      ),
      featureEnabled: asBool(
        map.get(PAID_SERVICE_SETTING_KEYS.feature),
        DEFAULT_PAID_SERVICE_FLAGS.featureEnabled,
      ),
      listingFeesEnabled: asBool(
        map.get(PAID_SERVICE_SETTING_KEYS.listingFees),
        DEFAULT_PAID_SERVICE_FLAGS.listingFeesEnabled,
      ),
    };
  }

  async assertPromotionEnabled() {
    const flags = await this.getFlags();
    if (!flags.promotionEnabled) {
      throwApi(403, 'service_disabled', 'خدمة ترويج الإعلان غير مفعّلة حالياً');
    }
  }

  async assertPinEnabled() {
    const flags = await this.getFlags();
    if (!flags.pinEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تثبيت الإعلان غير مفعّلة حالياً');
    }
  }

  async assertFeatureEnabled() {
    const flags = await this.getFlags();
    if (!flags.featureEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تمييز الإعلان غير مفعّلة حالياً');
    }
  }

  async assertBoostTypeEnabled(boostType: BoostType) {
    const flags = await this.getFlags();
    if (boostType === 'pinned' && !flags.pinEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تثبيت الإعلان غير مفعّلة حالياً');
    }
    if (boostType === 'featured' && !flags.featureEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تمييز الإعلان غير مفعّلة حالياً');
    }
    if (boostType === 'both' && (!flags.pinEnabled || !flags.featureEnabled)) {
      throwApi(
        403,
        'service_disabled',
        'خدمة التثبيت أو التمييز غير مفعّلة حالياً',
      );
    }
  }

  async assertListingFeesEnabled() {
    const flags = await this.getFlags();
    if (!flags.listingFeesEnabled) {
      throwApi(
        403,
        'service_disabled',
        'خدمة سداد رسوم الإعلان غير مفعّلة حالياً',
      );
    }
  }
}
