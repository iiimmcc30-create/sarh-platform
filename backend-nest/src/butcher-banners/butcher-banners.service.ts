import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import { UpdateButcherBannerDto } from './dto/butcher-banners.dto';

const DEFAULTS = [
  {
    slot: 1,
    titleAr: 'لحوم، دواجن، ومأكولات بحرية',
    subtitleAr: 'كل اللي تحتاجه في سوق الملاحم',
    captionAr: 'طازج، موثوق، وسهل الطلب',
    imageUrl:
      'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=1400&q=80',
  },
  {
    slot: 2,
    titleAr: 'ملاحم موثّقة قريبة منك',
    subtitleAr: 'اطلب واستلم من الملحمة أو إلى بابك',
    captionAr: 'عروض يومية على الذبائح الطازجة',
    imageUrl:
      'https://images.unsplash.com/photo-1558030006-450675393462?w=1400&q=80',
  },
  {
    slot: 3,
    titleAr: 'تسوق بثقة مع سرح',
    subtitleAr: 'ادفع بسهولة وتابع طلبك لحظة بلحظة',
    captionAr: 'تجربة سلسة من الطلب حتى الاستلام',
    imageUrl:
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=1400&q=80',
  },
] as const;

@Injectable()
export class ButcherBannersService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaults() {
    for (const row of DEFAULTS) {
      await this.prisma.butcherMarketBanner.upsert({
        where: { slot: row.slot },
        create: { ...row, isActive: true },
        update: {},
      });
    }
  }

  async listPublic() {
    await this.ensureDefaults();
    return this.prisma.butcherMarketBanner.findMany({
      where: { isActive: true },
      orderBy: { slot: 'asc' },
      take: 3,
    });
  }

  async listAll() {
    await this.ensureDefaults();
    return this.prisma.butcherMarketBanner.findMany({
      take: 20,
      orderBy: { slot: 'asc' },
    });
  }

  async update(id: string, dto: UpdateButcherBannerDto) {
    const existing = await this.prisma.butcherMarketBanner.findUnique({
      where: { id },
    });
    if (!existing) throwApi(404, 'not_found', 'البنر غير موجود');

    return this.prisma.butcherMarketBanner.update({
      where: { id },
      data: {
        ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
        ...(dto.subtitleAr !== undefined ? { subtitleAr: dto.subtitleAr } : {}),
        ...(dto.captionAr !== undefined ? { captionAr: dto.captionAr } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
