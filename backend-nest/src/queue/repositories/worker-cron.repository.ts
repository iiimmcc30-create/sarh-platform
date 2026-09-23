import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CRON_BATCH_TAKE } from '../../common/utils/query-limits';

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
}
