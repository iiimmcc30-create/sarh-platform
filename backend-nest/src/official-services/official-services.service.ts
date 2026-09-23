import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { throwApi } from '../common/exceptions/api.exception';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import {
  CreateMinistryPostDto,
  CreateOfficialServiceDto,
  UpdateMinistryPostDto,
  UpdateMinistryProfileDto,
  UpdateOfficialServiceDto,
} from './dto/official-services.dto';
import {
  MEWA_ABOUT,
  MEWA_DEFAULT_AVATAR_PATH,
  MEWA_DEFAULT_COVER_PATH,
  MEWA_PUBLIC_EMAIL,
  MEWA_PUBLIC_PHONE,
  MEWA_WEBSITE,
} from './mewa.constants';
import { OfficialServicesRepository } from './repositories/official-services.repository';

@Injectable()
export class OfficialServicesService implements OnModuleInit {
  private readonly logger = new Logger(OfficialServicesService.name);

  constructor(
    private readonly repo: OfficialServicesRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async onModuleInit() {
    this.ensureDefaultMediaFiles();
    await this.ensureMewaUser();
  }

  ensureDefaultMediaFiles() {
    const destDir = join(process.cwd(), 'public', 'uploads', 'mewa');
    mkdirSync(destDir, { recursive: true });
    for (const file of ['avatar.jpg', 'cover.jpg'] as const) {
      const dest = join(destDir, file);
      if (existsSync(dest)) continue;
      const source = join(process.cwd(), 'assets', 'mewa', file);
      if (!existsSync(source)) continue;
      copyFileSync(source, dest);
    }
  }

  async ensureMewaUser() {
    this.ensureDefaultMediaFiles();
    let user = await this.repo.findMewaUser();
    if (!user) {
      const passwordHash = await this.hashConfiguredOrRandomPassword();
      user = await this.repo.createMewaUser({ passwordHash });
      this.logger.log(`MEWA official account created (${user.id})`);
      return user;
    }

    if (!user.isActive || user.allowPrivateMessages !== false || user.isAI) {
      user = await this.repo.updateMewaUserFlags(user.id);
    }

    const blanks: Record<string, string> = {};
    if (!user.avatar) blanks.avatar = MEWA_DEFAULT_AVATAR_PATH;
    if (!user.coverImage) blanks.coverImage = MEWA_DEFAULT_COVER_PATH;
    if (!user.about) blanks.about = MEWA_ABOUT;
    if (!user.website) blanks.website = MEWA_WEBSITE;
    if (!user.publicPhone) blanks.publicPhone = MEWA_PUBLIC_PHONE;
    if (!user.publicEmail) blanks.publicEmail = MEWA_PUBLIC_EMAIL;
    if (Object.keys(blanks).length > 0) {
      user = await this.repo.fillMewaDefaults(user.id, blanks);
    }

    await this.applyConfiguredPassword(user);
    return this.repo.findMewaUser();
  }

  private async hashConfiguredOrRandomPassword() {
    const password = process.env.MEWA_ACCOUNT_PASSWORD?.trim();
    if (password) return bcrypt.hash(password, 12);
    this.logger.warn(
      'MEWA_ACCOUNT_PASSWORD is not set; created a random password. Set the env var to enable login.',
    );
    return bcrypt.hash(randomBytes(48).toString('hex'), 12);
  }

  private async applyConfiguredPassword(user: {
    id: string;
    passwordHash: string;
  }) {
    const password = process.env.MEWA_ACCOUNT_PASSWORD?.trim();
    if (!password) return;
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (matches) return;
    await this.repo.updateMewaPassword(
      user.id,
      await bcrypt.hash(password, 12),
    );
  }

  listActive() {
    return this.repo.findActive();
  }

  listAll() {
    return this.repo.findAll();
  }

  async getActiveById(id: string) {
    const service = await this.repo.findById(id);
    if (!service || !service.active) {
      throwApi(404, 'not_found', 'الخدمة غير موجودة');
    }
    return service;
  }

  async getAccount(viewerId?: string) {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    const [followersCount, servicesCount, follow] = await Promise.all([
      this.repo.countFollowers(user.id),
      this.repo.countActive(),
      viewerId
        ? this.repo.findFollow(viewerId, user.id)
        : Promise.resolve(null),
    ]);

    return {
      id: user.id,
      username: user.username,
      arabicName: user.arabicName,
      displayName: user.displayName,
      bio: user.bio,
      about: user.about,
      avatar: user.avatar,
      coverImage: user.coverImage,
      website: user.website,
      publicPhone: user.publicPhone,
      publicEmail: user.publicEmail,
      verified: user.verified,
      allowPrivateMessages: user.allowPrivateMessages,
      followersCount,
      servicesCount,
      isFollowing: Boolean(follow),
    };
  }

  async updateAccount(dto: UpdateMinistryProfileDto) {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    await this.repo.updateMewaProfile(user.id, {
      ...(dto.arabicName !== undefined ? { arabicName: dto.arabicName } : {}),
      ...(dto.displayName !== undefined
        ? { displayName: dto.displayName }
        : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.about !== undefined ? { about: dto.about } : {}),
      ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      ...(dto.coverImage !== undefined ? { coverImage: dto.coverImage } : {}),
      ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
      ...(dto.website !== undefined ? { website: dto.website } : {}),
      ...(dto.publicPhone !== undefined
        ? { publicPhone: dto.publicPhone }
        : {}),
      ...(dto.publicEmail !== undefined
        ? { publicEmail: dto.publicEmail }
        : {}),
      allowPrivateMessages: false,
    });
    return this.getAccount();
  }

  async listMinistryPosts() {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    return this.repo.listMewaPosts(user.id);
  }

  async createMinistryPost(dto: CreateMinistryPostDto) {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    const post = await this.repo.createMewaPost({
      authorId: user.id,
      content: dto.content,
      arabicContent: dto.content,
      image: dto.image ?? null,
      images: dto.image ? [dto.image] : [],
    });
    await this.invalidatePostCaches(user.id);
    return post;
  }

  async updateMinistryPost(id: string, dto: UpdateMinistryPostDto) {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    const existing = await this.repo.findMewaPost(id, user.id);
    if (!existing) throwApi(404, 'not_found', 'المنشور غير موجود');
    const post = await this.repo.updateMewaPost(id, {
      ...(dto.content !== undefined
        ? { content: dto.content, arabicContent: dto.content }
        : {}),
      ...(dto.image !== undefined
        ? { image: dto.image, images: dto.image ? [dto.image] : [] }
        : {}),
      ...(dto.isHidden !== undefined ? { isHidden: dto.isHidden } : {}),
    });
    await this.invalidatePostCaches(user.id);
    return post;
  }

  async removeMinistryPost(id: string) {
    const user = await this.ensureMewaUser();
    if (!user) throwApi(404, 'not_found', 'حساب الوزارة غير موجود');
    const existing = await this.repo.findMewaPost(id, user.id);
    if (!existing) throwApi(404, 'not_found', 'المنشور غير موجود');
    await this.repo.archiveMewaPost(id);
    await this.invalidatePostCaches(user.id);
    return { deleted: true };
  }

  private async invalidatePostCaches(authorId: string) {
    await this.cache.del('posts:feed:first').catch(() => undefined);
    await this.cache.delPattern('posts:feed:*').catch(() => 0);
    await this.cache.delPattern(`posts:user:${authorId}:*`).catch(() => 0);
  }

  private serviceData(
    dto: CreateOfficialServiceDto | UpdateOfficialServiceDto,
  ) {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      ...(dto.externalUrl !== undefined
        ? { externalUrl: dto.externalUrl }
        : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.feeText !== undefined ? { feeText: dto.feeText } : {}),
      ...(dto.isFree !== undefined ? { isFree: dto.isFree } : {}),
      ...(dto.steps !== undefined ? { steps: dto.steps } : {}),
      ...(dto.conditions !== undefined ? { conditions: dto.conditions } : {}),
      ...(dto.documents !== undefined ? { documents: dto.documents } : {}),
      ...(dto.deliveryChannel !== undefined
        ? { deliveryChannel: dto.deliveryChannel }
        : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
  }

  async create(dto: CreateOfficialServiceDto) {
    return this.repo.create({
      ...this.serviceData(dto),
      title: dto.title,
      description: dto.description,
      category: dto.category,
      icon: dto.icon,
      externalUrl: dto.externalUrl,
      active: dto.active ?? true,
      isFree: dto.isFree ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  async update(id: string, dto: UpdateOfficialServiceDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'الخدمة غير موجودة');
    return this.repo.update(id, this.serviceData(dto));
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throwApi(404, 'not_found', 'الخدمة غير موجودة');
    await this.repo.delete(id);
    return { deleted: true };
  }
}
