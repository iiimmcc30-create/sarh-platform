import { Injectable } from '@nestjs/common';
import { PlanAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.plan.findMany({
      take: 100,
      where: includeInactive ? undefined : { isActive: true },
      include: { features: { orderBy: { key: 'asc' } } },
      orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.plan.findUnique({
      where: { id },
      include: { features: { orderBy: { key: 'asc' } } },
    });
  }

  findBySlug(slug: string, audience: PlanAudience) {
    return this.prisma.plan.findUnique({
      where: { slug_audience: { slug, audience } },
      include: { features: { orderBy: { key: 'asc' } } },
    });
  }

  countSubscriptions(planId: string) {
    return this.prisma.subscription.count({ where: { planDbId: planId } });
  }

  create(data: Prisma.PlanCreateInput) {
    return this.prisma.plan.create({
      data,
      include: { features: true },
    });
  }

  update(id: string, data: Prisma.PlanUpdateInput) {
    return this.prisma.plan.update({
      where: { id },
      data,
      include: { features: true },
    });
  }

  delete(id: string) {
    return this.prisma.plan.delete({ where: { id } });
  }

  upsertFeature(
    planId: string,
    key: string,
    value: string,
    valueType: Prisma.PlanFeatureCreateInput['valueType'],
  ) {
    return this.prisma.planFeature.upsert({
      where: { planId_key: { planId, key } },
      create: { planId, key, value, valueType },
      update: { value, valueType },
    });
  }

  deleteFeature(planId: string, key: string) {
    return this.prisma.planFeature.delete({
      where: { planId_key: { planId, key } },
    });
  }

  replaceFeatures(
    planId: string,
    features: Array<{
      key: string;
      value: string;
      valueType: Prisma.PlanFeatureCreateInput['valueType'];
    }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.planFeature.deleteMany({ where: { planId } });
      if (features.length > 0) {
        await tx.planFeature.createMany({
          data: features.map((f) => ({ planId, ...f })),
        });
      }
      return tx.plan.findUnique({
        where: { id: planId },
        include: { features: { orderBy: { key: 'asc' } } },
      });
    });
  }
}
