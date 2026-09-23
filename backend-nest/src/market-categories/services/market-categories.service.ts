import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  CreateMarketCategoryDto,
  ReorderMarketCategoriesDto,
  UpdateMarketCategoryDto,
} from '../dto/market-categories.dto';
import { MarketCategoriesRepository } from '../repositories/market-categories.repository';

@Injectable()
export class MarketCategoriesService {
  constructor(private readonly repo: MarketCategoriesRepository) {}

  listPublicTree() {
    return this.repo.findRoots({ activeOnly: true });
  }

  listAdminTree() {
    return this.repo.findRoots({ activeOnly: false });
  }

  async getById(id: string) {
    const category = await this.repo.findById(id);
    if (!category) throwApi(404, 'not_found', 'التصنيف غير موجود');
    return category;
  }

  async listSubcategories(id: string, opts?: { activeOnly?: boolean }) {
    const parent = await this.repo.findById(id);
    if (!parent) throwApi(404, 'not_found', 'التصنيف غير موجود');
    return this.repo.findChildren(id, {
      activeOnly: opts?.activeOnly ?? true,
    });
  }

  async create(dto: CreateMarketCategoryDto) {
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.repo.findBySlug(slug);
    if (existing) {
      throwApi(400, 'slug_taken', 'معرّف التصنيف مستخدم مسبقاً');
    }

    if (dto.parentId) {
      const parent = await this.repo.findById(dto.parentId);
      if (!parent) throwApi(404, 'not_found', 'التصنيف الأب غير موجود');
      if (parent.parentId) {
        throwApi(
          400,
          'invalid_parent',
          'لا يمكن إنشاء أكثر من مستويين للتصنيفات',
        );
      }
    }

    try {
      return await this.repo.create({
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        slug,
        icon: dto.icon?.trim() || null,
        emoji: dto.emoji?.trim() || null,
        parent: dto.parentId ? { connect: { id: dto.parentId } } : undefined,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        requiresWeight: dto.requiresWeight ?? false,
        legacyCategory: dto.legacyCategory?.trim() || null,
      });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throwApi(400, 'slug_taken', 'معرّف التصنيف مستخدم مسبقاً');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateMarketCategoryDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'التصنيف غير موجود');

    if (dto.slug && dto.slug.trim().toLowerCase() !== existing.slug) {
      const clash = await this.repo.findBySlug(dto.slug.trim().toLowerCase());
      if (clash) throwApi(400, 'slug_taken', 'معرّف التصنيف مستخدم مسبقاً');
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throwApi(400, 'invalid_parent', 'لا يمكن جعل التصنيف أباً لنفسه');
      }
      const parent = await this.repo.findById(dto.parentId);
      if (!parent) throwApi(404, 'not_found', 'التصنيف الأب غير موجود');
      if (parent.parentId) {
        throwApi(
          400,
          'invalid_parent',
          'لا يمكن إنشاء أكثر من مستويين للتصنيفات',
        );
      }
    }

    const data: Prisma.MarketCategoryUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr.trim();
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn?.trim() || null;
    if (dto.slug !== undefined) data.slug = dto.slug.trim().toLowerCase();
    if (dto.icon !== undefined) data.icon = dto.icon?.trim() || null;
    if (dto.emoji !== undefined) data.emoji = dto.emoji?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.requiresWeight !== undefined)
      data.requiresWeight = dto.requiresWeight;
    if (dto.legacyCategory !== undefined) {
      data.legacyCategory = dto.legacyCategory?.trim() || null;
    }
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }

    try {
      return await this.repo.update(id, data);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throwApi(400, 'slug_taken', 'معرّف التصنيف مستخدم مسبقاً');
      }
      throw err;
    }
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'التصنيف غير موجود');

    const refs = await this.repo.countListingRefs(id);
    if (refs > 0) {
      // Soft-deactivate only — hard delete blocked when listings reference
      await this.repo.softDeactivate(id);
      return { deleted: true, deactivated: true, listingRefs: refs };
    }

    await this.repo.softDeactivate(id);
    return { deleted: true, deactivated: true, listingRefs: 0 };
  }

  async reorder(dto: ReorderMarketCategoriesDto) {
    const updated = await this.repo.reorder(dto.items);
    return { items: updated };
  }

  findSubcategoryWithParent(id: string) {
    return this.repo.findSubcategoryWithParent(id);
  }

  findByIdRaw(id: string) {
    return this.repo.findById(id);
  }
}
