import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ADMIN_PAGE_SIZE_DEFAULT, ADMIN_PAGE_SIZE_MAX } from '../constants';
import {
  ApplicationRepository,
  type ApplicationEntity,
} from '../repositories/application.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { TransactionService } from './transaction.service';
import { appendTimelineEvent } from '../helpers/timeline';
import {
  assertTransition,
  timelineActionForTransition,
} from '../helpers/stateTransitions';
import { buildPaginatedResult } from '../helpers/validation';
import {
  toAdminApplicationSummary,
  toApplicationDetail,
  toTimelineEventDto,
  withAdminDocumentUrls,
} from '../mappers';
import { ButcherApplicationError, mapPrismaUniqueViolation } from '../errors';
import {
  assertAccountCredentialsAvailable,
  assertApplicationHasAccountCredentials,
} from '../helpers/accountCredentials';
import type {
  AdminApplicationSummaryDto,
  AdminListQuery,
  ApproveInput,
  ApproveResultDto,
  ApplicationDetailDto,
  CommentInput,
  PaginatedResult,
  RejectInput,
  TimelineEventDto,
} from '../types';
import { LoggerService } from '../../common/services/logger.service';
import { ButcherApplicationNotificationsService } from './butcher-application-notifications.service';
import { ButcherRankingService } from '../../butchers/services/butcher-ranking.service';

function resolveAdminLimit(limit?: number): number {
  if (!limit) return ADMIN_PAGE_SIZE_DEFAULT;
  return Math.min(Math.max(limit, 1), ADMIN_PAGE_SIZE_MAX);
}

/** Maps an approved application snapshot into butcher persistence input (AdminService-owned). */
export function buildButcherCreateInput(
  application: ApplicationEntity,
  butcherUserId: string,
): Prisma.ButcherUncheckedCreateInput {
  return {
    userId: butcherUserId,
    nameAr: application.nameAr!,
    nameEn: application.nameEn!,
    country: application.country!,
    city: application.city!,
    cityAr: application.cityAr!,
    address: application.address!,
    addressAr: application.addressAr!,
    lat: application.lat,
    lng: application.lng,
    phone: application.shopPhone!,
    bioAr: application.bioAr,
    bioEn: application.bioEn,
    specialties: application.specialties,
    commercialReg: application.commercialReg,
    openTime: application.openTime,
    closeTime: application.closeTime,
    closedDays: [],
    type: 'regular',
    sourceApplicationId: application.id,
  };
}

@Injectable()
export class ButcherApplicationAdminService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly documents: DocumentRepository,
    private readonly transactions: TransactionService,
    private readonly applicationNotifications: ButcherApplicationNotificationsService,
    private readonly logger: LoggerService,
    private readonly ranking: ButcherRankingService,
  ) {}

  async listApplications(query: AdminListQuery): Promise<
    PaginatedResult<AdminApplicationSummaryDto> & {
      counts: { submitted: number };
    }
  > {
    const limit = resolveAdminLimit(query.limit);
    const rows = await this.applications.listAdminApplications(query, limit);
    const page = buildPaginatedResult(rows, limit);
    const submitted = await this.applications.countSubmittedApplications();

    return {
      items: page.items.map(toAdminApplicationSummary),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      counts: { submitted },
    };
  }

  async getApplication(applicationId: string): Promise<ApplicationDetailDto> {
    const application =
      await this.applications.getApplicationByIdOrThrow(applicationId);
    return withAdminDocumentUrls(
      toApplicationDetail(application, {
        includeAdminFields: true,
        includeUser: true,
      }),
    );
  }

  async approveApplication(
    adminUserId: string,
    applicationId: string,
    input: ApproveInput = {},
  ): Promise<ApproveResultDto> {
    try {
      const result = await this.transactions.runInTransaction(async (tx) => {
        const existing = await this.applications.getApplicationByIdOrThrow(
          applicationId,
          tx,
        );

        if (existing.status === 'APPROVED' && existing.sourcedButcher) {
          return {
            application: await withAdminDocumentUrls(
              toApplicationDetail(existing, {
                includeAdminFields: true,
                includeUser: true,
              }),
            ),
            butcher: {
              id: existing.sourcedButcher.id,
              sourceApplicationId: applicationId,
            },
            isNewApproval: false as const,
          };
        }

        assertTransition(existing.status, 'APPROVED');
        assertApplicationHasAccountCredentials(existing);
        const accountUsername = existing.accountUsername as string;
        const accountPasswordHash = existing.accountPasswordHash as string;
        const accountEmail = existing.accountEmail ?? null;
        const available = await assertAccountCredentialsAvailable(tx, {
          accountUsername,
          accountEmail,
          shopPhone: existing.shopPhone,
        });

        const now = new Date();
        const freeButcherPlan = await tx.plan.findUnique({
          where: { slug_audience: { slug: 'free', audience: 'BUTCHER' } },
          select: { id: true },
        });

        const butcherUser = await tx.user.create({
          data: {
            username: accountUsername,
            email: accountEmail,
            phone: available.phone,
            passwordHash: accountPasswordHash,
            displayName: existing.nameEn ?? existing.nameAr ?? accountUsername,
            arabicName: existing.nameAr ?? existing.nameEn ?? accountUsername,
            country: existing.country ?? 'SA',
            role: 'BUTCHER',
            isActive: true,
            verified: false,
            subscription: {
              create: {
                planId: 'free',
                planAudience: 'BUTCHER',
                planDbId: freeButcherPlan?.id ?? null,
                renewDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
              },
            },
          },
          select: { id: true },
        });

        const butcher = await this.applications.createButcher(
          tx,
          buildButcherCreateInput(existing, butcherUser.id),
        );

        await this.documents.approveUploadedDocuments(
          tx,
          applicationId,
          adminUserId,
          now,
        );

        const updated = await this.applications.updateApplicationStatus(
          tx,
          applicationId,
          {
            status: 'APPROVED',
            approvedAt: now,
          },
        );

        await appendTimelineEvent(tx, {
          applicationId,
          action: timelineActionForTransition('APPROVED'),
          createdBy: adminUserId,
          comment: input.comment ?? null,
          metadata: {
            butcherId: butcher.id,
            butcherUserId: butcherUser.id,
          },
        });

        return {
          application: await withAdminDocumentUrls(
            toApplicationDetail(updated, {
              includeAdminFields: true,
              includeUser: true,
            }),
          ),
          butcher,
          isNewApproval: true as const,
        };
      });

      if (result.isNewApproval) {
        void this.ranking.onButcherCreated(result.butcher.id);
        void this.applicationNotifications
          .notifyApplicationApproved(
            result.application,
            result.application.user!.id,
            result.butcher.id,
          )
          .catch((err) =>
            this.logger.warn(
              { err, applicationId },
              'Approve notification side effect failed',
            ),
          );
      }

      const { isNewApproval: _, ...approveResult } = result;
      return approveResult;
    } catch (err) {
      const mapped = mapPrismaUniqueViolation(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async rejectApplication(
    adminUserId: string,
    applicationId: string,
    input: RejectInput,
  ): Promise<ApplicationDetailDto> {
    if (!input.rejectionReason?.trim()) {
      throw new ButcherApplicationError('REJECTION_REASON_REQUIRED');
    }

    const rejectionReason = input.rejectionReason.trim();

    const result = await this.transactions.runInTransaction(async (tx) => {
      const existing = await this.applications.getApplicationByIdOrThrow(
        applicationId,
        tx,
      );
      assertTransition(existing.status, 'REJECTED');

      const now = new Date();
      const updated = await this.applications.updateApplicationStatus(
        tx,
        applicationId,
        {
          status: 'REJECTED',
          rejectedAt: now,
          rejectionReason,
        },
      );

      await appendTimelineEvent(tx, {
        applicationId,
        action: timelineActionForTransition('REJECTED'),
        createdBy: adminUserId,
        comment: input.comment ?? null,
        metadata: { rejectionReason },
      });

      return withAdminDocumentUrls(
        toApplicationDetail(updated, {
          includeAdminFields: true,
          includeUser: true,
        }),
      );
    });

    void this.applicationNotifications
      .notifyApplicationRejected(result, result.user!.id)
      .catch((err) =>
        this.logger.warn(
          { err, applicationId },
          'Reject notification side effect failed',
        ),
      );

    return result;
  }

  async addComment(
    adminUserId: string,
    applicationId: string,
    input: CommentInput,
  ): Promise<TimelineEventDto> {
    if (!input.comment?.trim()) {
      throw new ButcherApplicationError('APPLICATION_INCOMPLETE', {
        missing: ['comment'],
      });
    }

    return this.transactions.runInTransaction(async (tx) => {
      await this.applications.getApplicationByIdOrThrow(applicationId, tx);

      const event = await appendTimelineEvent(tx, {
        applicationId,
        action: 'COMMENT',
        createdBy: adminUserId,
        comment: input.comment.trim(),
      });

      return toTimelineEventDto(event);
    });
  }
}
