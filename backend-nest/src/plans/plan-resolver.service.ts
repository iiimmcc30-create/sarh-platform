import { Injectable, OnModuleInit } from '@nestjs/common';
import type { PlanAudience } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPermissions,
  FREE_PLAN_SLUG,
  normalizePlanSlug,
  type PlanApiResponse,
  type ResolvedPlan,
} from './plan.types';
import { PLAN_FEATURE_LABELS_AR } from './plan-feature-catalog';

@Injectable()
export class PlanResolverService implements OnModuleInit {
  private cache = new Map<string, ResolvedPlan>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  cacheKey(slug: string, audience: PlanAudience): string {
    return `${audience}:${normalizePlanSlug(slug)}`;
  }

  async refreshCache(): Promise<void> {
    const plans = await this.prisma.plan.findMany({
      take: 100,
      where: { isActive: true },
      include: { features: true },
      orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }],
    });

    const next = new Map<string, ResolvedPlan>();
    for (const plan of plans) {
      const normalizedSlug = normalizePlanSlug(plan.slug);
      const resolved: ResolvedPlan = {
        id: plan.id,
        slug: normalizedSlug,
        name: plan.name,
        description: plan.description,
        audience: plan.audience,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        currency: plan.currency,
        yearlyDiscount: plan.yearlyDiscount,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
        permissions: buildPermissions(plan.features),
        features: plan.features.map((f) => ({
          key: f.key,
          value: f.value,
          valueType: f.valueType,
        })),
      };
      next.set(this.cacheKey(normalizedSlug, plan.audience), resolved);
    }
    this.cache = next;
  }

  resolveSync(slug: string, audience: PlanAudience): ResolvedPlan | null {
    const normalized = normalizePlanSlug(slug);
    return this.cache.get(this.cacheKey(normalized, audience)) ?? null;
  }

  async resolve(
    slug: string,
    audience: PlanAudience,
  ): Promise<ResolvedPlan | null> {
    const cached = this.resolveSync(slug, audience);
    if (cached) return cached;

    const plan = await this.prisma.plan.findFirst({
      where: { slug: normalizePlanSlug(slug), audience, isActive: true },
      include: { features: true },
    });
    if (!plan) return null;

    const resolved: ResolvedPlan = {
      id: plan.id,
      slug: normalizePlanSlug(plan.slug),
      name: plan.name,
      description: plan.description,
      audience: plan.audience,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      yearlyDiscount: plan.yearlyDiscount,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      permissions: buildPermissions(plan.features),
      features: plan.features.map((f) => ({
        key: f.key,
        value: f.value,
        valueType: f.valueType,
      })),
    };
    this.cache.set(this.cacheKey(resolved.slug, plan.audience), resolved);
    return resolved;
  }

  async resolveDefaultFree(audience: PlanAudience): Promise<ResolvedPlan> {
    const plan = await this.resolve(FREE_PLAN_SLUG, audience);
    if (!plan) {
      throw new Error(`Default free plan missing for audience ${audience}`);
    }
    return plan;
  }

  getAllActive(): ResolvedPlan[] {
    return Array.from(this.cache.values()).sort(
      (a, b) =>
        a.audience.localeCompare(b.audience) || a.sortOrder - b.sortOrder,
    );
  }

  getActiveByAudience(audience: PlanAudience): ResolvedPlan[] {
    return this.getAllActive()
      .filter((p) => p.audience === audience)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  isPaidPlan(slug: string): boolean {
    return normalizePlanSlug(slug) !== FREE_PLAN_SLUG;
  }

  planTier(slug: string, audience: PlanAudience): number {
    const plan = this.resolveSync(slug, audience);
    return plan?.sortOrder ?? 0;
  }

  getPlanPrice(
    slug: string,
    audience: PlanAudience,
    cycle: 'monthly' | 'yearly',
  ): number {
    const plan = this.resolveSync(slug, audience);
    if (!plan || plan.slug === FREE_PLAN_SLUG) return 0;
    return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  }

  getUpgradableSlugs(audience: PlanAudience): string[] {
    return this.getActiveByAudience(audience)
      .filter((p) => p.monthlyPrice > 0)
      .map((p) => p.slug);
  }

  toApiResponse(plan: ResolvedPlan): PlanApiResponse {
    return {
      ...plan,
      legacyId: plan.slug,
      price: plan.monthlyPrice,
      // Never expose storeCommission rate to plan/catalog clients (butcher/mobile).
      displayFeatures: plan.features
        .filter((f) => f.key !== 'storeCommission')
        .map((f) => ({
          key: f.key,
          label: PLAN_FEATURE_LABELS_AR[f.key] ?? f.key,
          value: buildPermissions([f])[f.key] as string | number | boolean,
          valueType: f.valueType,
        })),
    };
  }

  formatDisplayValue(key: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
    if (key === 'maxAdsPer24Hours' && typeof value === 'number' && value < 0) {
      return 'غير محدود';
    }
    if (key === 'storeCommission' && typeof value === 'number') {
      // Admin-facing helper only — public plan API omits this feature.
      if (value <= 0) return 'معفى';
      return 'حسب سياسة المنصة';
    }
    return String(value ?? '');
  }
}
