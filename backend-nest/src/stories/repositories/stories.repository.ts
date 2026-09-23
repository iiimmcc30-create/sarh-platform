import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  notDeleted,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';

export const STORY_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  country: true,
} as const;

export const STORY_LISTING_SELECT = {
  id: true,
  title: true,
  arabicTitle: true,
  images: true,
  price: true,
  currency: true,
} as const;

export const BUTCHER_STORY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  logo: true,
  subscriptionActive: true,
  country: true,
} as const;

const STORY_DETAIL_INCLUDE = {
  user: { select: STORY_USER_SELECT },
  listing: { select: STORY_LISTING_SELECT },
} as const;

@Injectable()
export class StoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveStories() {
    return this.prisma.story.findMany({
      take: 100,
      where: { expiresAt: { gt: new Date() }, ...notDeleted },
      orderBy: { createdAt: 'asc' },
      include: STORY_DETAIL_INCLUDE,
    });
  }

  findActiveStoriesForUser(userId: string) {
    return this.prisma.story.findMany({
      take: 100,
      where: { userId, expiresAt: { gt: new Date() }, ...notDeleted },
      orderBy: { createdAt: 'asc' },
      include: STORY_DETAIL_INCLUDE,
    });
  }

  findStoryById(id: string) {
    return this.prisma.story.findFirst({
      where: { id, ...notDeleted },
      include: STORY_DETAIL_INCLUDE,
    });
  }

  findStoryOwnerMeta(id: string) {
    return this.prisma.story.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        captionAr: true,
        caption: true,
      },
    });
  }

  createStory(data: Prisma.StoryCreateInput) {
    return this.prisma.story.create({
      data,
      include: STORY_DETAIL_INCLUDE,
    });
  }

  softDeleteStory(id: string) {
    return this.prisma.story.update({
      where: { id },
      data: softDeleteFields(),
    });
  }

  findListingOwnedByUser(listingId: string, userId: string) {
    return this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, status: 'active' },
      select: { id: true },
    });
  }

  incrementViewsCount(storyId: string) {
    return this.prisma.story.update({
      where: { id: storyId },
      data: { viewsCount: { increment: 1 } },
      select: { viewsCount: true },
    });
  }

  setReactionsCount(storyId: string, count: number) {
    return this.prisma.story.update({
      where: { id: storyId },
      data: { reactionsCount: count },
      select: { reactionsCount: true },
    });
  }

  countReactions(storyId: string) {
    return this.prisma.storyReaction.count({ where: { storyId } });
  }

  findActiveButcherStories() {
    return this.prisma.butcherStory.findMany({
      take: 100,
      where: { expiresAt: { gt: new Date() }, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      include: { butcher: { select: BUTCHER_STORY_SELECT } },
    });
  }

  findButcherByUserId(userId: string) {
    return this.prisma.butcher.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  createButcherStory(data: Prisma.ButcherStoryCreateInput) {
    return this.prisma.butcherStory.create({
      data,
      include: { butcher: { select: BUTCHER_STORY_SELECT } },
    });
  }

  findButcherStoryWithOwner(id: string) {
    return this.prisma.butcherStory.findUnique({
      where: { id },
      include: { butcher: { select: { userId: true } } },
    });
  }

  softDeleteButcherStory(id: string) {
    return this.prisma.butcherStory.update({
      where: { id },
      data: softDeleteFields(),
    });
  }
}
