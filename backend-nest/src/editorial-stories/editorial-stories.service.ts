import { Injectable } from '@nestjs/common';
import { throwApi } from '../common/exceptions/api.exception';
import {
  CreateEditorialStoryDto,
  UpdateEditorialStoryDto,
} from './dto/editorial-stories.dto';
import { deriveEditorialStoryTitle } from './editorial-story-title.util';
import { EditorialStoriesRepository } from './repositories/editorial-stories.repository';

@Injectable()
export class EditorialStoriesService {
  constructor(private readonly repo: EditorialStoriesRepository) {}

  listPublic() {
    return this.repo.findPublic();
  }

  listAll() {
    return this.repo.findAll();
  }

  async create(dto: CreateEditorialStoryDto) {
    const titleAr =
      dto.titleAr?.trim() || deriveEditorialStoryTitle(dto.bodyAr);
    if (!titleAr) {
      throwApi(400, 'validation_error', 'أدخل نص المقال');
    }

    return this.repo.create({
      titleAr,
      bodyAr: dto.bodyAr,
      imageUrl: dto.imageUrl,
      duration: dto.duration ?? 20,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      publishedAt: new Date(),
    });
  }

  async update(id: string, dto: UpdateEditorialStoryDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'الستوري غير موجود');

    const titleAr =
      dto.titleAr !== undefined
        ? dto.titleAr.trim() ||
          deriveEditorialStoryTitle(dto.bodyAr ?? existing.bodyAr)
        : dto.bodyAr !== undefined
          ? deriveEditorialStoryTitle(dto.bodyAr)
          : undefined;

    return this.repo.update(id, {
      ...(titleAr !== undefined ? { titleAr } : {}),
      ...(dto.bodyAr !== undefined ? { bodyAr: dto.bodyAr } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'الستوري غير موجود');
    await this.repo.softDelete(id);
    return { deleted: true };
  }
}
