import { Injectable } from '@nestjs/common';
import type { ApplicationSnapshotInput, UserListQuery } from '../types';
import { USER_PAGE_SIZE_DEFAULT, USER_PAGE_SIZE_MAX } from '../constants';
import { ApplicationRepository } from '../repositories/application.repository';
import {
  assertNotModified,
  assertUserHasNoButcher,
  assertApplicationOwner,
} from '../helpers/transaction';
import { TransactionService } from './transaction.service';
import { appendTimelineEvent } from '../helpers/timeline';
import {
  assertEditableStatus,
  assertTransition,
  timelineActionForTransition,
} from '../helpers/stateTransitions';
import {
  validateSubmitSnapshot,
  validateRequiredDocuments,
  collectChangedFields,
  buildPaginatedResult,
} from '../helpers/validation';
import { validateSnapshotFormat } from '../helpers/snapshotValidation';
import {
  prepareStoredButcherAccountCredentials,
  assertAccountCredentialsAvailable,
} from '../helpers/accountCredentials';
import {
  toApplicationDetail,
  toApplicationSummaryFromEntity,
} from '../mappers';
import {
  ButcherApplicationError,
  mapPrismaUniqueViolation,
  isButcherApplicationError,
} from '../errors';
import type {
  ApplicationDetailDto,
  ApplicationSummaryDto,
  PaginatedResult,
  SubmitInput,
  WithdrawInput,
} from '../types';
import { LoggerService } from '../../common/services/logger.service';
import { ButcherApplicationNotificationsService } from './butcher-application-notifications.service';

function resolveUserLimit(limit?: number): number {
  if (!limit) return USER_PAGE_SIZE_DEFAULT;
  return Math.min(Math.max(limit, 1), USER_PAGE_SIZE_MAX);
}

@Injectable()
export class ButcherApplicationUserService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly transactions: TransactionService,
    private readonly applicationNotifications: ButcherApplicationNotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async createDraft(
    userId: string,
    data: ApplicationSnapshotInput = {},
  ): Promise<ApplicationDetailDto> {
    validateSnapshotFormat(data);

    try {
      return await this.transactions.runInTransaction(async (tx) => {
        await assertUserHasNoButcher(tx, userId);

        const draft =
          await this.applications.findActiveApplicationByUserAndStatus(
            tx,
            userId,
            'DRAFT',
          );
        if (draft) throw new ButcherApplicationError('ACTIVE_DRAFT_EXISTS');

        const submitted =
          await this.applications.findActiveApplicationByUserAndStatus(
            tx,
            userId,
            'SUBMITTED',
          );
        if (submitted)
          throw new ButcherApplicationError('ACTIVE_SUBMITTED_EXISTS');

        const application = await this.applications.createApplication(
          tx,
          userId,
          data,
        );

        await appendTimelineEvent(tx, {
          applicationId: application.id,
          action: 'CREATE',
          createdBy: userId,
          metadata: {
            fieldsProvided: Object.keys(data).filter(
              (k) => (data as Record<string, unknown>)[k] !== undefined,
            ),
          },
        });

        return toApplicationDetail(application);
      });
    } catch (err) {
      const mapped = mapPrismaUniqueViolation(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async listApplications(
    userId: string,
    query: UserListQuery,
  ): Promise<PaginatedResult<ApplicationSummaryDto>> {
    const limit = resolveUserLimit(query.limit);
    const rows = await this.applications.listUserApplications(
      userId,
      query,
      limit,
    );
    const page = buildPaginatedResult(rows, limit);

    return {
      ...page,
      items: page.items.map((app) => toApplicationSummaryFromEntity(app)),
    };
  }

  async getApplication(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationDetailDto> {
    const application =
      await this.applications.getApplicationByIdOrThrow(applicationId);
    assertApplicationOwner(application.userId, userId);
    return toApplicationDetail(application);
  }

  async updateDraft(
    userId: string,
    applicationId: string,
    data: ApplicationSnapshotInput,
    expectedUpdatedAt?: Date | string,
  ): Promise<ApplicationDetailDto> {
    validateSnapshotFormat(data);

    return this.transactions.runInTransaction(async (tx) => {
      const existing = await this.applications.getApplicationByIdOrThrow(
        applicationId,
        tx,
      );
      assertApplicationOwner(existing.userId, userId);
      assertEditableStatus(existing.status);
      assertNotModified(existing.updatedAt, expectedUpdatedAt);

      const changedFields = collectChangedFields(
        existing as unknown as Record<string, unknown>,
        data as Record<string, unknown>,
      );

      const updated = await this.applications.updateApplicationSnapshot(
        tx,
        applicationId,
        data,
      );

      if (changedFields.length > 0) {
        await appendTimelineEvent(tx, {
          applicationId,
          action: 'UPDATE',
          createdBy: userId,
          metadata: { changedFields },
        });
      }

      return toApplicationDetail(updated);
    });
  }

  async submitApplication(
    userId: string,
    applicationId: string,
    input: SubmitInput,
  ): Promise<ApplicationDetailDto> {
    if (!input.acceptedTerms || !input.confirmAccuracy) {
      throw new ButcherApplicationError('APPLICATION_INCOMPLETE', {
        missing: ['acceptedTerms', 'confirmAccuracy'],
      });
    }

    const account = await prepareStoredButcherAccountCredentials({
      accountUsername: input.accountUsername,
      accountEmail: input.accountEmail,
      password: input.password,
      confirmPassword: input.confirmPassword,
    });

    try {
      const result = await this.transactions.runInTransaction(async (tx) => {
        await assertUserHasNoButcher(tx, userId);

        const existing = await this.applications.getApplicationByIdOrThrow(
          applicationId,
          tx,
        );
        assertApplicationOwner(existing.userId, userId);
        assertTransition(existing.status, 'SUBMITTED');

        validateSubmitSnapshot(existing);
        validateRequiredDocuments(existing);
        await assertAccountCredentialsAvailable(tx, {
          accountUsername: account.accountUsername,
          accountEmail: account.accountEmail,
          shopPhone: existing.shopPhone,
        });

        const now = new Date();
        const updated = await this.applications.updateApplicationStatus(
          tx,
          applicationId,
          {
            status: 'SUBMITTED',
            submittedAt: now,
            acceptedTermsAt: now,
            accountUsername: account.accountUsername,
            accountEmail: account.accountEmail,
            accountPasswordHash: account.accountPasswordHash,
          },
        );

        await appendTimelineEvent(tx, {
          applicationId,
          action: timelineActionForTransition('SUBMITTED'),
          createdBy: userId,
        });

        return toApplicationDetail(updated);
      });

      void this.applicationNotifications
        .notifyAfterApplicationSubmit(result, userId)
        .catch((err) =>
          this.logger.warn(
            { err, applicationId, userId },
            'Submit notification side effect failed',
          ),
        );

      return result;
    } catch (err) {
      const mapped = mapPrismaUniqueViolation(err);
      if (mapped) throw mapped;
      if (isButcherApplicationError(err)) throw err;
      throw err;
    }
  }

  async withdrawApplication(
    userId: string,
    applicationId: string,
    input: WithdrawInput = {},
  ): Promise<ApplicationDetailDto> {
    const result = await this.transactions.runInTransaction(async (tx) => {
      const existing = await this.applications.getApplicationByIdOrThrow(
        applicationId,
        tx,
      );
      assertApplicationOwner(existing.userId, userId);
      assertTransition(existing.status, 'WITHDRAWN');

      const now = new Date();
      const updated = await this.applications.updateApplicationStatus(
        tx,
        applicationId,
        {
          status: 'WITHDRAWN',
          withdrawnAt: now,
        },
      );

      await appendTimelineEvent(tx, {
        applicationId,
        action: timelineActionForTransition('WITHDRAWN'),
        createdBy: userId,
        comment: input.reason ?? null,
      });

      return toApplicationDetail(updated);
    });

    void this.applicationNotifications
      .notifyApplicationWithdrawn(result, userId)
      .catch((err) =>
        this.logger.warn(
          { err, applicationId, userId },
          'Withdraw notification side effect failed',
        ),
      );

    return result;
  }
}
