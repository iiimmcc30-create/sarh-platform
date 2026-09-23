import { Injectable } from '@nestjs/common';
import { Prisma, type FeedProductCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const publicProductWhere = {
  deletedAt: null,
  published: true,
} satisfies Prisma.FeedProductWhereInput;

@Injectable()
export class FeedSuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublic(filters: { q?: string; category?: FeedProductCategory }) {
    const q = filters.q?.trim();
    const productMatch: Prisma.FeedProductWhereInput = {
      ...publicProductWhere,
      ...(filters.category ? { category: filters.category } : {}),
      ...(q
        ? {
            nameAr: { contains: q, mode: 'insensitive' },
          }
        : {}),
    };

    const where: Prisma.FeedSupplierWhereInput = {
      deletedAt: null,
      published: true,
      AND: [
        filters.category
          ? {
              products: {
                some: { ...publicProductWhere, category: filters.category },
              },
            }
          : {},
        q
          ? {
              OR: [
                { nameAr: { contains: q, mode: 'insensitive' } },
                { cityAr: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { products: { some: productMatch } },
              ],
            }
          : {},
      ],
    };

    return this.prisma.feedSupplier.findMany({
      take: 200,
      where,
      orderBy: [{ verified: 'desc' }, { nameAr: 'asc' }],
    });
  }

  findPublicById(id: string) {
    return this.prisma.feedSupplier.findFirst({
      where: { id, deletedAt: null, published: true },
    });
  }

  findAllAdmin(q?: string) {
    const query = q?.trim();
    return this.prisma.feedSupplier.findMany({
      take: 200,
      where: {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { nameAr: { contains: query, mode: 'insensitive' } },
                { cityAr: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
    });
  }

  findAdminById(id: string) {
    return this.prisma.feedSupplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  createSupplier(data: Prisma.FeedSupplierCreateInput) {
    return this.prisma.feedSupplier.create({
      data,
      include: { products: { where: { deletedAt: null } } },
    });
  }

  updateSupplier(id: string, data: Prisma.FeedSupplierUpdateInput) {
    return this.prisma.feedSupplier.update({
      where: { id },
      data,
      include: { products: { where: { deletedAt: null } } },
    });
  }

  softDeleteSupplier(id: string) {
    return this.prisma.$transaction([
      this.prisma.feedProduct.updateMany({
        where: { supplierId: id, deletedAt: null },
        data: { deletedAt: new Date(), published: false },
      }),
      this.prisma.feedSupplier.update({
        where: { id },
        data: { deletedAt: new Date(), published: false },
      }),
    ]);
  }

  createProduct(data: Prisma.FeedProductCreateInput) {
    return this.prisma.feedProduct.create({ data });
  }

  findProductById(id: string) {
    return this.prisma.feedProduct.findFirst({
      where: { id, deletedAt: null },
    });
  }

  updateProduct(id: string, data: Prisma.FeedProductUpdateInput) {
    return this.prisma.feedProduct.update({ where: { id }, data });
  }

  softDeleteProduct(id: string) {
    return this.prisma.feedProduct.update({
      where: { id },
      data: { deletedAt: new Date(), published: false },
    });
  }
}
