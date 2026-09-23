import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VIEWER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
} as const;

@Injectable()
export class StoryViewRepository {
  constructor(private readonly prisma: PrismaService) {}

  findView(storyId: string, viewerId: string) {
    return this.prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId } },
      select: { id: true },
    });
  }

  createView(storyId: string, viewerId: string) {
    return this.prisma.storyView.create({
      data: { storyId, viewerId },
      select: { id: true, createdAt: true },
    });
  }

  findViewedStoryIds(viewerId: string, storyIds: string[]) {
    if (storyIds.length === 0)
      return Promise.resolve([] as { storyId: string }[]);
    return this.prisma.storyView.findMany({
      take: Math.max(storyIds.length, 1),
      where: { viewerId, storyId: { in: storyIds } },
      select: { storyId: true },
    });
  }

  findViewers(storyId: string, take = 100) {
    return this.prisma.storyView.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { viewer: { select: VIEWER_SELECT } },
    });
  }
}
