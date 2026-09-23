import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class EditorialStoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublic() {
    return this.prisma.editorialStory.findMany({
      take: 100,
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findAll() {
    return this.prisma.editorialStory.findMany({
      take: 200,
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findById(id: string) {
    return this.prisma.editorialStory.findFirst({
      where: { id, deletedAt: null },
    });
  }

  create(data: Prisma.EditorialStoryCreateInput) {
    return this.prisma.editorialStory.create({ data });
  }

  update(id: string, data: Prisma.EditorialStoryUpdateInput) {
    return this.prisma.editorialStory.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return this.prisma.editorialStory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
