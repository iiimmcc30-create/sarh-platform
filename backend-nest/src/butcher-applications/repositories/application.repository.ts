import { Injectable } from '@nestjs/common';
import type { ButcherApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ApplicationSnapshotInput,
  AdminListQuery,
  UserListQuery,
} from '../types';
import type { TransactionClient } from '../helpers/transaction';
import type { AdminSortOption } from '../constants';
import { ButcherApplicationError } from '../errors';

const timelineInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    actor: { select: { id: true, username: true } },
  },
};

const documentInclude = {
  orderBy: { createdAt: 'asc' as const },
};

export const applicationInclude = {
  documents: documentInclude,
  timelineEvents: timelineInclude,
  sourcedButcher: { select: { id: true, userId: true } },
  user: {
    select: {
      id: true,
      username: true,
      phone: true,
      avatar: true,
      email: true,
      displayName: true,
      arabicName: true,
      role: true,
    },
  },
};

export type ApplicationEntity = Prisma.ButcherApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

const summaryInclude = {
  sourcedButcher: { select: { id: true, userId: true } },
};

export type ApplicationSummaryEntity = Prisma.ButcherApplicationGetPayload<{
  include: typeof summaryInclude;
}>;

export function buildAdminApplicationWhere(
  query: AdminListQuery,
): Prisma.ButcherApplicationWhereInput {
  const where: Prisma.ButcherApplicationWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.country) where.country = query.country;

  if (query.submittedFrom || query.submittedTo) {
    where.submittedAt = {};
    if (query.submittedFrom) where.submittedAt.gte = query.submittedFrom;
    if (query.submittedTo) where.submittedAt.lte = query.submittedTo;
  }

  if (query.search && query.search.length >= 2) {
    const asNumber = parseInt(query.search, 10);
    where.OR = [
      { nameAr: { contains: query.search } },
      { nameEn: { contains: query.search, mode: 'insensitive' } },
      ...(Number.isFinite(asNumber) ? [{ applicationNumber: asNumber }] : []),
      {
        user: {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
          ],
        },
      },
    ];
  }

  return where;
}

export function adminOrderBy(sort: AdminSortOption = 'submittedAt_desc') {
  switch (sort) {
    case 'createdAt_desc':
      return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    case 'updatedAt_desc':
      return [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];
    case 'submittedAt_desc':
    default:
      return [{ submittedAt: 'desc' as const }, { id: 'desc' as const }];
  }
}

@Injectable()
export class ApplicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient) {
    return tx ?? this.prisma;
  }

  findActiveApplicationByUserAndStatus(
    tx: TransactionClient,
    userId: string,
    status: ButcherApplicationStatus,
  ) {
    return tx.butcherApplication.findFirst({
      where: { userId, status },
      select: { id: true, status: true },
    });
  }

  async getNextApplicationNumber(
    tx: TransactionClient,
    userId: string,
  ): Promise<number> {
    const latest = await tx.butcherApplication.findFirst({
      where: { userId },
      orderBy: { applicationNumber: 'desc' },
      select: { applicationNumber: true },
    });
    return (latest?.applicationNumber ?? 0) + 1;
  }

  async createApplication(
    tx: TransactionClient,
    userId: string,
    data: ApplicationSnapshotInput,
  ): Promise<ApplicationEntity> {
    const applicationNumber = await this.getNextApplicationNumber(tx, userId);

    return tx.butcherApplication.create({
      data: {
        userId,
        applicationNumber,
        status: 'DRAFT',
        ...data,
      },
      include: applicationInclude,
    });
  }

  findApplicationById(
    id: string,
    tx?: TransactionClient,
  ): Promise<ApplicationEntity | null> {
    return this.client(tx).butcherApplication.findUnique({
      where: { id },
      include: applicationInclude,
    });
  }

  async getApplicationByIdOrThrow(
    id: string,
    tx?: TransactionClient,
  ): Promise<ApplicationEntity> {
    const application = await this.findApplicationById(id, tx);
    if (!application) {
      throw new ButcherApplicationError('APPLICATION_NOT_FOUND');
    }
    return application;
  }

  updateApplicationSnapshot(
    tx: TransactionClient,
    id: string,
    data: ApplicationSnapshotInput,
  ): Promise<ApplicationEntity> {
    return tx.butcherApplication.update({
      where: { id },
      data,
      include: applicationInclude,
    });
  }

  updateApplicationStatus(
    tx: TransactionClient,
    id: string,
    data: Prisma.ButcherApplicationUpdateInput,
  ): Promise<ApplicationEntity> {
    return tx.butcherApplication.update({
      where: { id },
      data,
      include: applicationInclude,
    });
  }

  listUserApplications(
    userId: string,
    query: UserListQuery,
    limit: number,
  ): Promise<ApplicationSummaryEntity[]> {
    const where: Prisma.ButcherApplicationWhereInput = { userId };
    if (query.status) where.status = query.status;

    return this.prisma.butcherApplication.findMany({
      where,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: summaryInclude,
    });
  }

  listAdminApplications(
    query: AdminListQuery,
    limit: number,
  ): Promise<ApplicationEntity[]> {
    const where = buildAdminApplicationWhere(query);

    return this.prisma.butcherApplication.findMany({
      where,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: adminOrderBy(query.sort),
      include: applicationInclude,
    });
  }

  countSubmittedApplications(): Promise<number> {
    return this.prisma.butcherApplication.count({
      where: { status: 'SUBMITTED' },
    });
  }

  countDraftApplications(): Promise<number> {
    return this.prisma.butcherApplication.count({ where: { status: 'DRAFT' } });
  }

  createButcher(
    tx: TransactionClient,
    data: Prisma.ButcherUncheckedCreateInput,
  ): Promise<{ id: string; sourceApplicationId: string | null }> {
    return tx.butcher.create({
      data,
      select: { id: true, sourceApplicationId: true },
    });
  }

  async findAllAdminUserIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      take: 200,
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }
}
