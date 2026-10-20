import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/services/logger.service';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { CouncilsService } from './councils.service';
import { CouncilPresenceService } from './services/council-presence.service';
import { COUNCIL_USER_SELECT } from './lib/council-select';

export const ADMIN_COUNCILS_PAGE = 30;

export type AdminCouncilQuery = {
  status?: 'LIVE' | 'ENDED' | 'SCHEDULED';
  golden?: boolean;
  q?: string;
  cursor?: string;
};

/** Staff tools for «المجالس»: list, golden tier toggle, force-close. */
@Injectable()
export class AdminCouncilsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly councils: CouncilsService,
    private readonly presence: CouncilPresenceService,
    private readonly logger: LoggerService,
  ) {}

  async list(query: AdminCouncilQuery) {
    const where: Prisma.CouncilWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.golden !== undefined ? { golden: query.golden } : {}),
      ...(query.q
        ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
        : {}),
    };
    const rows = await this.prisma.council.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_COUNCILS_PAGE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        description: true,
        visibility: true,
        status: true,
        golden: true,
        goldenGrantedAt: true,
        goldenGrantedById: true,
        startedAt: true,
        endedAt: true,
        owner: { select: COUNCIL_USER_SELECT },
        _count: { select: { members: true } },
      },
    });
    const hasMore = rows.length > ADMIN_COUNCILS_PAGE;
    const page = rows.slice(0, ADMIN_COUNCILS_PAGE);
    const councils = await Promise.all(
      page.map(async (c) => ({
        ...c,
        membersCount: c._count.members,
        presentNow: c.status === 'LIVE' ? await this.presence.count(c.id) : 0,
      })),
    );
    return {
      councils,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async setGolden(actor: JwtPayload, id: string, golden: boolean) {
    const existing = await this.prisma.council.findUnique({
      where: { id },
      select: { id: true, golden: true },
    });
    if (!existing) throwApi(404, 'not_found', 'المجلس غير موجود');
    const updated = await this.prisma.council.update({
      where: { id },
      data: golden
        ? {
            golden: true,
            goldenGrantedAt: new Date(),
            goldenGrantedById: actor.userId,
          }
        : { golden: false, goldenGrantedAt: null, goldenGrantedById: null },
      select: { id: true, golden: true, goldenGrantedAt: true },
    });
    this.logger.info(
      { councilId: id, actorId: actor.userId, golden },
      'Council golden tier changed',
    );
    if (existing.golden !== golden) {
      await this.councils.refreshPublishGrants(id);
    }
    return updated;
  }

  async forceClose(actor: JwtPayload, id: string, reason?: string) {
    const existing = await this.prisma.council.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throwApi(404, 'not_found', 'المجلس غير موجود');
    const endedAt = await this.councils.forceEnd(id);
    this.logger.info(
      { councilId: id, actorId: actor.userId, reason: reason ?? null },
      'Council force-closed by staff',
    );
    return { closed: true, endedAt, alreadyEnded: endedAt === null };
  }
}
