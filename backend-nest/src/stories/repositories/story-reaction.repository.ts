import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StoryReactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReaction(storyId: string, userId: string) {
    return this.prisma.storyReaction.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });
  }

  upsertReaction(storyId: string, userId: string, type: string) {
    return this.prisma.storyReaction.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId, type },
      update: { type },
    });
  }

  deleteReaction(storyId: string, userId: string) {
    return this.prisma.storyReaction.deleteMany({
      where: { storyId, userId },
    });
  }

  findReactionsForStories(userId: string, storyIds: string[]) {
    if (storyIds.length === 0)
      return Promise.resolve([] as { storyId: string; type: string }[]);
    return this.prisma.storyReaction.findMany({
      take: Math.max(storyIds.length, 1),
      where: { userId, storyId: { in: storyIds } },
      select: { storyId: true, type: true },
    });
  }
}
