import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CRON_BATCH_TAKE } from '../../common/utils/query-limits';
import {
  MEDIA_DELETION_MAX_ATTEMPTS,
  type MediaDeletionStore,
} from '../../shared/lib/media-deletion';

@Injectable()
export class WorkerCronRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOverdueListingFees(take = CRON_BATCH_TAKE) {
    return this.prisma.listingFee.findMany({
      where: { status: 'pending', dueDate: { lt: new Date() } },
      select: { id: true, userId: true, commission: true },
      take,
    });
  }

  /** MediaDeletionJob store for processMediaDeletionBatch. */
  mediaDeletionStore(): MediaDeletionStore {
    return {
      findPending: (take) =>
        this.prisma.mediaDeletionJob.findMany({
          where: {
            processedAt: null,
            attempts: { lt: MEDIA_DELETION_MAX_ATTEMPTS },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, url: true, attempts: true },
          take,
        }),
      markDone: (id, note) =>
        this.prisma.mediaDeletionJob.update({
          where: { id },
          data: {
            processedAt: new Date(),
            lastError: note ?? null,
            attempts: { increment: 1 },
          },
        }),
      markFailed: (id, error) =>
        this.prisma.mediaDeletionJob.update({
          where: { id },
          data: { lastError: error, attempts: { increment: 1 } },
        }),
    };
  }
}
