import { Injectable } from '@nestjs/common';
import { AdminRepository } from './repositories/admin.repository';
import { JwtTokenService } from '../auth/services/jwt-token.service';
import { RedisSessionService } from '../redis/services/redis-session.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { AuthRepository } from '../auth/repositories/auth.repository';
import { LoggerService } from '../common/services/logger.service';
import { throwApi, ApiException } from '../common/exceptions/api.exception';
import { managedContactFields } from './lib/managed-listing';
import { LISTINGS_FEED_CACHE_PATTERN } from '../listings/listings-cache-keys';
import type { ListingCategory } from '@prisma/client';
import { authorizeCronCleanup } from './lib/cron-auth';
import { buildAdminMembership } from '../subscriptions/verification/admin-membership';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type { PaginationQueryDto } from './dto/admin.dto';
import {
  createSectionSchema,
  paginationQuerySchema,
  updateListingSchema,
  createManagedListingSchema,
  updateManagedListingSchema,
  updatePostSchema,
  updateReportSchema,
  updateSectionSchema,
  updateSettingSchema,
  updateUserSchema,
} from './dto/admin.dto';

const ADMIN_ROLES = new Set(['ADMIN', 'MODERATOR']);

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly jwt: JwtTokenService,
    private readonly sessions: RedisSessionService,
    private readonly authRepo: AuthRepository,
    private readonly logger: LoggerService,
    private readonly cache: RedisCacheService,
  ) {}

  private parsePagination(query: Record<string, unknown>): PaginationQueryDto {
    const parsed = paginationQuerySchema.safeParse(query);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return parsed.data;
  }

  getDashboardStats() {
    return this.repo.getDashboardStats();
  }

  listListingFeeCompliance() {
    return this.repo.listListingFeeCompliance();
  }

  async closeAccountForUnpaidListingFees(
    userId: string,
    actor: JwtPayload,
    reason: string,
  ) {
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 4) {
      throwApi(400, 'validation_error', 'يجب ذكر سبب إغلاق الحساب');
    }
    const target = await this.repo.findUserById(userId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');
    if (target.id === actor.userId) {
      throwApi(400, 'cannot_close_self', 'لا يمكنك إغلاق حسابك');
    }
    await this.repo.updateUser(userId, { isActive: false });
    const action = await this.repo.recordAccountAction({
      userId,
      actorId: actor.userId,
      action: 'deactivate_unpaid_listing_fees',
      reason: trimmed,
    });
    this.logger.info(
      { userId, by: actor.userId },
      'Admin closed account for unpaid listing fees',
    );
    return { userId, isActive: false, action };
  }

  async listUsers(query: Record<string, unknown>) {
    const page = await this.repo.listUsers(this.parsePagination(query));
    const payments = await this.repo.findLastPaidSubscriptionPayments(
      page.items.map((u) => u.id),
    );
    const lastByUser = new Map(payments.map((p) => [p.userId, p]));
    return {
      ...page,
      items: page.items.map(
        ({ subscription, accountVerificationRequest, ...user }) => ({
          ...user,
          membership: buildAdminMembership(
            { ...user, subscription, accountVerificationRequest },
            lastByUser.get(user.id) ?? null,
          ),
        }),
      ),
    };
  }

  async getUser(id: string) {
    const record = await this.repo.findUserDetailById(id);
    if (!record) throwApi(404, 'not_found', 'المستخدم غير موجود');
    const [lastPaid] = await this.repo.findLastPaidSubscriptionPayments([id]);
    const { subscription, accountVerificationRequest, ...user } = record;
    return {
      user: {
        ...user,
        membership: buildAdminMembership(
          { ...user, subscription, accountVerificationRequest },
          lastPaid ?? null,
        ),
      },
    };
  }

  async updateUser(
    id: string,
    body: Record<string, unknown>,
    actor: JwtPayload,
  ) {
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    if (parsed.data.role !== undefined && actor.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'تغيير الدور متاح للمسؤول فقط');
    }
    const user = await this.repo.updateUser(id, parsed.data);
    return { user };
  }

  async deleteUser(id: string, actor: JwtPayload) {
    if (id === actor.userId) {
      throwApi(400, 'cannot_delete_self', 'لا يمكنك حذف حسابك');
    }

    const target = await this.repo.findUserById(id);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');
    if (ADMIN_ROLES.has(target.role)) {
      throwApi(400, 'cannot_delete_staff', 'لا يمكن حذف حساب مسؤول أو مشرف');
    }

    await this.repo.purgeUser(id);
    this.logger.info({ userId: id, by: actor.userId }, 'Admin purged user');
    return { deleted: true, archived: true };
  }

  listPosts(query: Record<string, unknown>) {
    return this.repo.listPosts(this.parsePagination(query));
  }

  updatePost(id: string, body: Record<string, unknown>) {
    const parsed = updatePostSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return this.repo.updatePost(id, parsed.data).then((post) => ({ post }));
  }

  async deletePost(id: string) {
    await this.repo.softDeletePost(id);
    return { deleted: true, archived: true };
  }

  listListings(query: Record<string, unknown>) {
    return this.repo.listListings(this.parsePagination(query));
  }

  updateListing(id: string, body: Record<string, unknown>) {
    const parsed = updateListingSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return this.repo
      .updateListing(id, parsed.data)
      .then((listing) => ({ listing }));
  }

  async deleteListing(id: string, actor?: JwtPayload) {
    const existing = await this.repo.findListingOrigin(id);
    if (!existing) throwApi(404, 'not_found', 'الإعلان غير موجود');
    const managed = existing.origin === 'ADMIN_MANAGED';
    if (actor) {
      await this.repo.softDeleteListingRecorded(id, actor.userId, managed);
    } else {
      await this.repo.softDeleteListing(id);
    }
    await this.invalidateListingSurfaces(id);
    return { deleted: true, archived: true };
  }

  async createManagedListing(actor: JwtPayload, body: Record<string, unknown>) {
    const parsed = createManagedListingSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const input = parsed.data;
    const identity = managedContactFields(input);
    const listing = await this.repo.createManagedListing(
      {
        ...identity,
        title: input.title,
        arabicTitle: input.title,
        description: input.description,
        arabicDescription: input.description,
        price: input.price,
        currency: 'SAR',
        category: input.category as ListingCategory,
        country: 'SA',
        images: input.images,
        videoUrl: input.videoUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        status: 'active',
        quantity: 1,
      },
      actor.userId,
    );
    await this.invalidateListingSurfaces(listing.id);
    return { listing };
  }

  async updateManagedListing(
    actor: JwtPayload,
    id: string,
    body: Record<string, unknown>,
  ) {
    const parsed = updateManagedListingSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const existing = await this.repo.findListingOrigin(id);
    if (!existing) throwApi(404, 'not_found', 'الإعلان غير موجود');
    if (existing.origin !== 'ADMIN_MANAGED' || existing.sellerId) {
      throwApi(
        400,
        'not_managed_listing',
        'لا يمكن تحويل إعلان مستخدم إلى إعلان مُدار',
      );
    }
    const input = parsed.data;
    const displayUsername =
      input.displayUsername ?? existing.displayUsername ?? '';
    const displaySellerName =
      input.displaySellerName ?? existing.displaySellerName ?? '';
    const displayPhone = input.displayPhone ?? existing.displayPhone ?? '';
    const displayRegion = input.displayRegion ?? existing.displayRegion ?? '';
    const identity = managedContactFields({
      displayUsername,
      displaySellerName,
      displayPhone,
      displayRegion,
    });
    const title = input.title ?? existing.arabicTitle;
    const description = input.description ?? existing.arabicDescription;
    const listing = await this.repo.updateManagedListing(
      id,
      {
        ...identity,
        title,
        arabicTitle: title,
        description,
        arabicDescription: description,
        price: input.price ?? existing.price,
        category: (input.category ?? existing.category) as ListingCategory,
        images: input.images ?? existing.images,
        videoUrl:
          input.videoUrl === undefined ? existing.videoUrl : input.videoUrl,
        thumbnailUrl:
          input.thumbnailUrl === undefined
            ? existing.thumbnailUrl
            : input.thumbnailUrl,
      },
      actor.userId,
    );
    await this.invalidateListingSurfaces(id);
    return { listing };
  }

  private async invalidateListingSurfaces(listingId?: string) {
    await this.cache.delPattern(LISTINGS_FEED_CACHE_PATTERN).catch(() => 0);
    await this.cache.delPattern('search:explore:*').catch(() => 0);
    await this.cache.delPattern('search:unified:*').catch(() => 0);
    if (listingId) {
      await this.cache.del(`listing:${listingId}`).catch(() => 0);
    }
  }

  listReports(query: Record<string, unknown>) {
    return this.repo.listTickets(this.parsePagination(query));
  }

  async getReport(id: string) {
    const ticket = await this.repo.findTicket(id);
    if (!ticket) throwApi(404, 'not_found', 'البلاغ غير موجود');
    return { ticket };
  }

  updateReport(id: string, body: Record<string, unknown>) {
    const parsed = updateReportSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return this.repo
      .updateTicket(id, parsed.data)
      .then((ticket) => ({ ticket }));
  }

  async deleteReport(id: string) {
    await this.repo.softDeleteTicket(id);
    return { deleted: true, archived: true };
  }

  listLiveStreams(query: Record<string, unknown>) {
    return this.repo.listLiveStreams(this.parsePagination(query));
  }

  stopLiveStream(id: string) {
    return this.repo.stopLiveStream(id).then((stream) => ({ stream }));
  }

  async deleteLiveStream(id: string) {
    await this.repo.softDeleteLiveStream(id);
    return { deleted: true, archived: true };
  }

  async listSettings() {
    await this.repo.ensureDefaultSettings();
    const settings = await this.repo.listSettings();
    return {
      settings: settings.map((s) => ({
        id: s.id,
        key: s.key,
        value: s.value,
        labelAr: s.labelAr,
        category: s.category,
        updatedAt: s.updatedAt,
      })),
    };
  }

  updateSetting(body: Record<string, unknown>) {
    const parsed = updateSettingSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return this.repo
      .upsertSetting(
        parsed.data.key,
        parsed.data.value,
        parsed.data.labelAr,
        parsed.data.category,
      )
      .then((setting) => ({ setting }));
  }

  listSections() {
    return this.repo.listSections().then((sections) => ({ sections }));
  }

  createSection(body: Record<string, unknown>, actorName?: string) {
    const parsed = createSectionSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return this.repo
      .createSection({
        ...parsed.data,
        updatedByName: actorName,
        publishedAt: parsed.data.isActive === false ? null : new Date(),
      })
      .then(async (section) => {
        await this.repo.createSectionVersion({
          section: { connect: { id: section.id } },
          titleAr: section.titleAr,
          titleEn: section.titleEn,
          bodyAr: section.bodyAr,
          bodyEn: section.bodyEn,
          version: 1,
          isPublished: section.isActive,
          createdByName: actorName,
        });
        return { section };
      });
  }

  async updateSection(
    id: string,
    body: Record<string, unknown>,
    actorName?: string,
  ) {
    const parsed = updateSectionSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const current = await this.repo.getSection(id);
    if (!current) throwApi(404, 'not_found', 'القسم غير موجود');

    const version = await this.repo.nextSectionVersion(id);
    await this.repo.createSectionVersion({
      section: { connect: { id } },
      titleAr: current.titleAr,
      titleEn: current.titleEn,
      bodyAr: current.bodyAr,
      bodyEn: current.bodyEn,
      version,
      isPublished: false,
      createdByName: actorName,
    });

    const section = await this.repo.updateSection(id, {
      ...parsed.data,
      updatedByName: actorName,
    });
    return { section };
  }

  async publishSection(
    id: string,
    body: Record<string, unknown> = {},
    actorName?: string,
  ) {
    const current = await this.repo.getSection(id);
    if (!current) throwApi(404, 'not_found', 'القسم غير موجود');

    // Apply latest editor fields before publishing so unsaved form edits are not dropped.
    const pendingKeys = Object.keys(body ?? {}).filter(
      (k) => body[k] !== undefined,
    );
    if (pendingKeys.length > 0) {
      const parsed = updateSectionSchema.safeParse(body);
      if (!parsed.success) {
        throwApi(
          400,
          'validation_error',
          'بيانات غير صحيحة',
          parsed.error.flatten(),
        );
      }
      const d = parsed.data;
      const contentChanged =
        (d.titleAr !== undefined && d.titleAr !== current.titleAr) ||
        (d.bodyAr !== undefined && d.bodyAr !== current.bodyAr) ||
        (d.titleEn !== undefined && d.titleEn !== current.titleEn) ||
        (d.bodyEn !== undefined && d.bodyEn !== current.bodyEn) ||
        (d.slug !== undefined && d.slug !== current.slug) ||
        (d.sortOrder !== undefined && d.sortOrder !== current.sortOrder);

      if (contentChanged) {
        const draftVersion = await this.repo.nextSectionVersion(id);
        await this.repo.createSectionVersion({
          section: { connect: { id } },
          titleAr: current.titleAr,
          titleEn: current.titleEn,
          bodyAr: current.bodyAr,
          bodyEn: current.bodyEn,
          version: draftVersion,
          isPublished: false,
          createdByName: actorName,
        });
        await this.repo.updateSection(id, {
          ...d,
          updatedByName: actorName,
        });
      }
    }

    const latest = await this.repo.getSection(id);
    if (!latest) throwApi(404, 'not_found', 'القسم غير موجود');

    const version = await this.repo.nextSectionVersion(id);
    await this.repo.createSectionVersion({
      section: { connect: { id } },
      titleAr: latest.titleAr,
      titleEn: latest.titleEn,
      bodyAr: latest.bodyAr,
      bodyEn: latest.bodyEn,
      version,
      isPublished: true,
      createdByName: actorName,
    });
    const section = await this.repo.updateSection(id, {
      isActive: true,
      publishedAt: new Date(),
      updatedByName: actorName,
    });
    return { section };
  }

  async unpublishSection(id: string, actorName?: string) {
    const section = await this.repo.updateSection(id, {
      isActive: false,
      updatedByName: actorName,
    });
    return { section };
  }

  async listSectionVersions(id: string) {
    const current = await this.repo.getSection(id);
    if (!current) throwApi(404, 'not_found', 'القسم غير موجود');
    const versions = await this.repo.listSectionVersions(id);
    return { section: current, versions };
  }

  async restoreSectionVersion(
    id: string,
    versionId: string,
    actorName?: string,
  ) {
    const current = await this.repo.getSection(id);
    if (!current) throwApi(404, 'not_found', 'القسم غير موجود');
    const snap = await this.repo.getSectionVersion(versionId);
    if (!snap || snap.sectionId !== id)
      throwApi(404, 'not_found', 'النسخة غير موجودة');

    const version = await this.repo.nextSectionVersion(id);
    await this.repo.createSectionVersion({
      section: { connect: { id } },
      titleAr: current.titleAr,
      titleEn: current.titleEn,
      bodyAr: current.bodyAr,
      bodyEn: current.bodyEn,
      version,
      isPublished: false,
      createdByName: actorName,
    });

    const section = await this.repo.updateSection(id, {
      titleAr: snap.titleAr,
      titleEn: snap.titleEn,
      bodyAr: snap.bodyAr,
      bodyEn: snap.bodyEn,
      updatedByName: actorName,
      isActive: false,
    });
    return { section, restoredFrom: snap.version };
  }

  async deleteSection(id: string) {
    await this.repo.softDeleteSection(id);
    return { deleted: true, archived: true };
  }

  async runCleanup() {
    const now = new Date();
    this.logger.info({}, 'Running scheduled cleanup');
    const [sessions, notifications, stories] = await this.repo.runCleanup(now);
    const stats = {
      expiredSessions: sessions.count,
      oldNotifications: notifications.count,
      expiredStories: stories.count,
    };
    this.logger.info({ stats }, 'Cleanup complete');
    return stats;
  }

  async assertAdminBearer(authHeader: string | undefined): Promise<void> {
    if (!authHeader?.startsWith('Bearer ')) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwt.verifyAccessToken(token);
      const blacklisted = await this.sessions.get<boolean>(
        `blacklist:${token}`,
      );
      if (blacklisted) throwApi(403, 'forbidden', 'غير مسموح');

      const user = await this.authRepo.getPasswordVersion(payload.userId);
      if (!user || (payload.passwordVersion ?? 0) !== user.passwordVersion) {
        throwApi(403, 'forbidden', 'غير مسموح');
      }

      const active = await this.authRepo.isUserActive(payload.userId);
      if (!active?.isActive) throwApi(403, 'forbidden', 'غير مسموح');

      if (!ADMIN_ROLES.has(payload.role))
        throwApi(403, 'forbidden', 'غير مسموح');
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throwApi(403, 'forbidden', 'غير مسموح');
    }
  }

  async runCleanupAuthorized(cronSecret?: string, authHeader?: string) {
    const decision = authorizeCronCleanup({
      expectedSecret: process.env.CRON_SECRET,
      providedSecret: cronSecret,
      nodeEnv: process.env.NODE_ENV,
    });
    if (decision === 'unconfigured') {
      throwApi(
        503,
        'cron_secret_unconfigured',
        'CRON_SECRET غير مُعدّ في الإنتاج',
      );
    }
    if (decision === 'cron_ok') {
      return this.runCleanup();
    }
    await this.assertAdminBearer(authHeader);
    return this.runCleanup();
  }
}
