import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import {
  CreateExploreSarhBannerDto,
  UpdateExploreSarhBannerDto,
} from './dto/explore-sarh-banners.dto';

@Injectable()
export class ExploreSarhBannersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic() {
    const rows = await this.prisma.exploreSarhBanner.findMany({
      take: 50,
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        imageUrl: true,
        accessibilityLabel: true,
        href: true,
        sortOrder: true,
      },
    });
    return rows.filter((row: { href?: string | null }) => {
      const href = typeof row.href === 'string' ? row.href : '';
      return href !== '/butchers' && !href.startsWith('/butchers/');
    });
  }

  listAll() {
    return this.prisma.exploreSarhBanner.findMany({
      take: 200,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateExploreSarhBannerDto) {
    const max = await this.prisma.exploreSarhBanner.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder =
      typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)
        ? dto.sortOrder
        : (max._max.sortOrder ?? -1) + 1;

    return this.prisma.exploreSarhBanner.create({
      data: {
        imageUrl: dto.imageUrl,
        accessibilityLabel: dto.accessibilityLabel,
        href: dto.href,
        isActive: dto.isActive ?? true,
        sortOrder,
      },
    });
  }

  async update(id: string, dto: UpdateExploreSarhBannerDto) {
    const existing = await this.prisma.exploreSarhBanner.findUnique({
      where: { id },
    });
    if (!existing) throwApi(404, 'not_found', 'البنر غير موجود');

    return this.prisma.exploreSarhBanner.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.accessibilityLabel !== undefined
          ? { accessibilityLabel: dto.accessibilityLabel }
          : {}),
        ...(dto.href !== undefined ? { href: dto.href } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async reorder(orderedIds: string[]) {
    const existing = await this.prisma.exploreSarhBanner.findMany({
      take: 200,
      select: { id: true },
    });
    const byId = new Set(existing.map((row) => row.id));
    const ordered = orderedIds.filter((id) => byId.has(id));
    const leftovers = existing
      .map((row) => row.id)
      .filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...leftovers];

    await this.prisma.$transaction(
      finalOrder.map((id, index) =>
        this.prisma.exploreSarhBanner.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.listAll();
  }

  async remove(id: string) {
    const existing = await this.prisma.exploreSarhBanner.findUnique({
      where: { id },
    });
    if (!existing) throwApi(404, 'not_found', 'البنر غير موجود');
    await this.prisma.exploreSarhBanner.delete({ where: { id } });
    return { id };
  }
}
