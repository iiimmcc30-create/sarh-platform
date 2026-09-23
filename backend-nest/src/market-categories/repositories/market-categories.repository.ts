import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  notDeleted,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';

const CATEGORY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  slug: true,
  icon: true,
  emoji: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
  requiresWeight: true,
  legacyCategory: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

@Injectable()
export class MarketCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRoots(opts: { activeOnly: boolean }) {
    return this.prisma.marketCategory.findMany({
      take: 200,
      where: {
        parentId: null,
        ...notDeleted,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        ...CATEGORY_SELECT,
        children: {
          where: {
            ...notDeleted,
            ...(opts.activeOnly ? { isActive: true } : {}),
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: CATEGORY_SELECT,
        },
      },
    });
  }

  findById(id: string, opts?: { includeDeleted?: boolean }) {
    return this.prisma.marketCategory.findFirst({
      where: {
        id,
        ...(opts?.includeDeleted ? {} : notDeleted),
      },
      select: {
        ...CATEGORY_SELECT,
        parent: { select: CATEGORY_SELECT },
        children: {
          where: notDeleted,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: CATEGORY_SELECT,
        },
      },
    });
  }

  findChildren(parentId: string, opts: { activeOnly: boolean }) {
    return this.prisma.marketCategory.findMany({
      take: 200,
      where: {
        parentId,
        ...notDeleted,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: CATEGORY_SELECT,
    });
  }

  findBySlug(slug: string) {
    return this.prisma.marketCategory.findFirst({
      where: { slug, ...notDeleted },
      select: CATEGORY_SELECT,
    });
  }

  findSubcategoryWithParent(id: string) {
    return this.prisma.marketCategory.findFirst({
      where: { id, ...notDeleted, parentId: { not: null } },
      select: {
        ...CATEGORY_SELECT,
        parent: { select: CATEGORY_SELECT },
      },
    });
  }

  create(data: Prisma.MarketCategoryCreateInput) {
    return this.prisma.marketCategory.create({
      data,
      select: CATEGORY_SELECT,
    });
  }

  update(id: string, data: Prisma.MarketCategoryUpdateInput) {
    return this.prisma.marketCategory.update({
      where: { id },
      data,
      select: CATEGORY_SELECT,
    });
  }

  softDeactivate(id: string) {
    return this.prisma.marketCategory.update({
      where: { id },
      data: {
        isActive: false,
        ...softDeleteFields(),
      },
      select: CATEGORY_SELECT,
    });
  }

  countListingRefs(id: string) {
    return this.prisma.listing.count({
      where: {
        ...notDeleted,
        OR: [{ categoryId: id }, { subcategoryId: id }],
      },
    });
  }

  reorder(items: { id: string; sortOrder: number }[]) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.marketCategory.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
          select: { id: true, sortOrder: true },
        }),
      ),
    );
  }
}
