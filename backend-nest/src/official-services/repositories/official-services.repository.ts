import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { OfficialServiceCategory } from '../dto/official-services.dto';
import {
  MEWA_ABOUT,
  MEWA_ARABIC_NAME,
  MEWA_BIO,
  MEWA_DEFAULT_AVATAR_PATH,
  MEWA_DEFAULT_COVER_PATH,
  MEWA_DISPLAY_NAME,
  MEWA_PUBLIC_EMAIL,
  MEWA_PUBLIC_PHONE,
  MEWA_USERNAME,
  MEWA_WEBSITE,
} from '../mewa.constants';

const DEFAULT_SERVICES: Array<{
  title: string;
  description: string;
  category: OfficialServiceCategory;
  icon: string;
  externalUrl: string;
}> = [
  {
    title: 'إصدار سجل مربي',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات لطلب إصدار سجل مربي.',
    category: 'veterinary',
    icon: 'document-text-outline',
    externalUrl:
      'https://anaam.mewa.gov.sa/anaam/ClinicRequestCardIssues/index?ClinicTypeId=fVfSs82hxvWEJfDm0UT+SA==',
  },
  {
    title: 'طلب موعد زيارة عيادة بيطرية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين الحاصلين على سجل مربي من تقديم طلب موعد زيارة العيادة البيطرية التابعة لهم.',
    category: 'veterinary',
    icon: 'medical-outline',
    externalUrl:
      'https://naama.sa/services/details/443c9549-acdd-4a2a-a13a-2f878921c556',
  },
  {
    title: 'موعد التحصينات',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات من طلب موعد من العيادة التابعة لتحصين المواشي.',
    category: 'veterinary',
    icon: 'shield-checkmark-outline',
    externalUrl:
      'https://naama.sa/services/details/167e9681-249e-4101-b714-aeacecd22a06',
  },
  {
    title: 'طلب ترقيم الماشية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تسمح للمستفيدين بطلب ترقيم الماشية إلكترونياً.',
    category: 'livestock',
    icon: 'barcode-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-numbering',
  },
  {
    title: 'إدارة بيانات الماشية',
    description:
      'خدمة إلكترونية مقدمة من وزارة البيئة والمياه والزراعة تمكن ملاك الماشية في المملكة من تحديث بيانات الماشية الخاصة بهم.',
    category: 'livestock',
    icon: 'list-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-data-management',
  },
  {
    title: 'حجز موعد مسلخ',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة للحجز الإلكتروني للذبح في المسالخ، وتمكن المستفيدين أفراد أو أصحاب الملاحم من الحجز المسبق.',
    category: 'slaughter',
    icon: 'cut-outline',
    externalUrl: 'https://web.naama.sa/slaughter/appointment/termsconditions',
  },
];

@Injectable()
export class OfficialServicesRepository implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.service.count();
    if (count > 0) return;
    await this.prisma.service.createMany({
      data: DEFAULT_SERVICES.map((s) => ({ ...s, active: true })),
    });
  }

  findActive() {
    return this.prisma.service.findMany({
      take: 200,
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findAll() {
    return this.prisma.service.findMany({
      take: 200,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.service.findUnique({ where: { id } });
  }

  countActive() {
    return this.prisma.service.count({ where: { active: true } });
  }

  findMewaUser() {
    return this.prisma.user.findFirst({
      where: { username: MEWA_USERNAME, deletedAt: null },
    });
  }

  createMewaUser(data: { passwordHash: string }) {
    return this.prisma.user.create({
      data: {
        username: MEWA_USERNAME,
        passwordHash: data.passwordHash,
        displayName: MEWA_DISPLAY_NAME,
        arabicName: MEWA_ARABIC_NAME,
        verified: true,
        isAI: false,
        emailVerified: true,
        role: 'USER',
        country: 'SA',
        bio: MEWA_BIO,
        about: MEWA_ABOUT,
        website: MEWA_WEBSITE,
        publicPhone: MEWA_PUBLIC_PHONE,
        publicEmail: MEWA_PUBLIC_EMAIL,
        avatar: MEWA_DEFAULT_AVATAR_PATH,
        coverImage: MEWA_DEFAULT_COVER_PATH,
        allowPrivateMessages: false,
        isActive: true,
      },
    });
  }

  updateMewaUserFlags(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        emailVerified: true,
        allowPrivateMessages: false,
        isAI: false,
      },
    });
  }

  fillMewaDefaults(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  updateMewaProfile(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  updateMewaPassword(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 },
      },
    });
  }

  listMewaPosts(authorId: string) {
    return this.prisma.post.findMany({
      take: 100,
      where: { authorId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMewaPost(id: string, authorId: string) {
    return this.prisma.post.findFirst({
      where: { id, authorId, deletedAt: null },
    });
  }

  createMewaPost(data: {
    authorId: string;
    content: string;
    arabicContent: string;
    image?: string | null;
    images?: string[];
  }) {
    return this.prisma.post.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        arabicContent: data.arabicContent,
        image: data.image ?? null,
        images: data.images ?? [],
      },
    });
  }

  updateMewaPost(
    id: string,
    data: {
      content?: string;
      arabicContent?: string;
      image?: string | null;
      images?: string[];
      isHidden?: boolean;
    },
  ) {
    return this.prisma.post.update({
      where: { id },
      data,
    });
  }

  archiveMewaPost(id: string) {
    return this.prisma.post.update({
      where: { id },
      data: { deletedAt: new Date(), isHidden: true },
    });
  }

  countFollowers(userId: string) {
    return this.prisma.follow.count({ where: { followingId: userId } });
  }

  findFollow(followerId: string, followingId: string) {
    return this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
  }

  create(data: Prisma.ServiceCreateInput) {
    return this.prisma.service.create({ data });
  }

  update(id: string, data: Prisma.ServiceUpdateInput) {
    return this.prisma.service.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.service.delete({ where: { id } });
  }
}
