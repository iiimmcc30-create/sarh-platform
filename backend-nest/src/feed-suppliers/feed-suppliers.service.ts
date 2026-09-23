import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { throwApi } from '../common/exceptions/api.exception';
import {
  CreateFeedProductDto,
  CreateFeedSupplierDto,
  UpdateFeedProductDto,
  UpdateFeedSupplierDto,
  type FeedProductCategoryValue,
} from './dto/feed-suppliers.dto';
import { FeedSuppliersRepository } from './repositories/feed-suppliers.repository';

@Injectable()
export class FeedSuppliersService {
  constructor(private readonly repo: FeedSuppliersRepository) {}

  async listPublic(q?: string, category?: FeedProductCategoryValue) {
    const rows = await this.repo.findPublic({ q, category });
    return rows.map(presentPublicSupplier);
  }

  async getPublic(id: string) {
    const supplier = await this.repo.findPublicById(id);
    if (!supplier) throwApi(404, 'not_found', 'المورد غير موجود');
    return presentPublicSupplier(supplier);
  }

  listAdmin(q?: string) {
    return this.repo.findAllAdmin(q);
  }

  async getAdmin(id: string) {
    const supplier = await this.repo.findAdminById(id);
    if (!supplier) throwApi(404, 'not_found', 'المورد غير موجود');
    return supplier;
  }

  create(dto: CreateFeedSupplierDto) {
    return this.repo.createSupplier(toSupplierCreate(dto));
  }

  async update(id: string, dto: UpdateFeedSupplierDto) {
    await this.getAdmin(id);
    return this.repo.updateSupplier(id, toSupplierUpdate(dto));
  }

  async remove(id: string) {
    await this.getAdmin(id);
    await this.repo.softDeleteSupplier(id);
    return { deleted: true };
  }

  async createProduct(supplierId: string, dto: CreateFeedProductDto) {
    await this.getAdmin(supplierId);
    return this.repo.createProduct({
      nameAr: dto.nameAr,
      category: dto.category,
      description: dto.description,
      imageUrl: dto.imageUrl,
      weightLabel: dto.weightLabel,
      available: dto.available ?? true,
      published: dto.published ?? true,
      supplier: { connect: { id: supplierId } },
    });
  }

  async updateProduct(id: string, dto: UpdateFeedProductDto) {
    const existing = await this.repo.findProductById(id);
    if (!existing) throwApi(404, 'not_found', 'المنتج غير موجود');
    return this.repo.updateProduct(id, {
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
      ...(dto.weightLabel !== undefined
        ? { weightLabel: dto.weightLabel }
        : {}),
      ...(dto.available !== undefined ? { available: dto.available } : {}),
      ...(dto.published !== undefined ? { published: dto.published } : {}),
    });
  }

  async removeProduct(id: string) {
    const existing = await this.repo.findProductById(id);
    if (!existing) throwApi(404, 'not_found', 'المنتج غير موجود');
    await this.repo.softDeleteProduct(id);
    return { deleted: true };
  }
}

function presentPublicSupplier<T extends object>(row: T) {
  const {
    _count,
    products: _products,
    productCount: _productCount,
    ...rest
  } = row as T & {
    _count?: unknown;
    products?: unknown;
    productCount?: unknown;
  };
  return rest;
}

function normalizeWebsite(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toSupplierCreate(
  dto: CreateFeedSupplierDto,
): Prisma.FeedSupplierCreateInput {
  return {
    nameAr: dto.nameAr,
    cityAr: dto.cityAr,
    logo: dto.logo,
    cover: dto.cover,
    description: dto.description,
    districtAr: dto.districtAr,
    addressAr: dto.addressAr,
    lat: dto.lat,
    lng: dto.lng,
    phone: dto.phone,
    whatsapp: dto.whatsapp,
    email: dto.email,
    website: normalizeWebsite(dto.website),
    hoursAr: dto.hoursAr,
    verified: dto.verified ?? false,
    published: dto.published ?? false,
  };
}

function toSupplierUpdate(
  dto: UpdateFeedSupplierDto,
): Prisma.FeedSupplierUpdateInput {
  return {
    ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
    ...(dto.cityAr !== undefined ? { cityAr: dto.cityAr } : {}),
    ...(dto.logo !== undefined ? { logo: dto.logo || null } : {}),
    ...(dto.cover !== undefined ? { cover: dto.cover || null } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
    ...(dto.districtAr !== undefined ? { districtAr: dto.districtAr } : {}),
    ...(dto.addressAr !== undefined ? { addressAr: dto.addressAr } : {}),
    ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
    ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
    ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
    ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
    ...(dto.email !== undefined ? { email: dto.email } : {}),
    ...(dto.website !== undefined
      ? { website: normalizeWebsite(dto.website) }
      : {}),
    ...(dto.hoursAr !== undefined ? { hoursAr: dto.hoursAr } : {}),
    ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
    ...(dto.published !== undefined ? { published: dto.published } : {}),
  };
}
