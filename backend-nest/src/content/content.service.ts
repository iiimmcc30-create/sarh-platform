import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { POLICY_SEEDS } from './policy-seed';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  listPublicSections() {
    return this.prisma.contentSection.findMany({
      take: 100,
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        slug: true,
        titleAr: true,
        titleEn: true,
        bodyAr: true,
        bodyEn: true,
        sortOrder: true,
        isActive: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
  }

  getPublicSection(slug: string) {
    return this.prisma.contentSection.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      select: {
        slug: true,
        titleAr: true,
        titleEn: true,
        bodyAr: true,
        bodyEn: true,
        sortOrder: true,
        isActive: true,
        publishedAt: true,
        updatedAt: true,
        updatedByName: true,
      },
    });
  }

  async ensurePolicySeeds() {
    for (const seed of POLICY_SEEDS) {
      await this.prisma.contentSection.upsert({
        where: { slug: seed.slug },
        create: {
          slug: seed.slug,
          titleAr: seed.titleAr,
          bodyAr: seed.bodyAr,
          sortOrder: seed.sortOrder,
          isActive: true,
          publishedAt: new Date(),
        },
        update: {},
      });
    }
    return this.listPublicSections();
  }
}
