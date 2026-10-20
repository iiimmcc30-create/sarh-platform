import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeleted } from '../../common/utils/soft-delete.util';

const LIVE_LIST_SELECT = {
  id: true,
  title: true,
  arabicTitle: true,
  category: true,
  topic: true,
  thumbnail: true,
  viewers: true,
  peakViewers: true,
  likes: true,
  startedAt: true,
  host: {
    select: {
      id: true,
      username: true,
      displayName: true,
      arabicName: true,
      avatar: true,
      verified: true,
      verifiedTier: true,
      country: true,
    },
  },
} as const;

const STREAM_DETAIL_SELECT = {
  id: true,
  title: true,
  arabicTitle: true,
  category: true,
  topic: true,
  thumbnail: true,
  isLive: true,
  viewers: true,
  peakViewers: true,
  likes: true,
  startedAt: true,
  endedAt: true,
  hlsUrl: true,
  host: {
    select: {
      id: true,
      username: true,
      displayName: true,
      arabicName: true,
      avatar: true,
      verified: true,
      verifiedTier: true,
      country: true,
    },
  },
  comments: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    select: {
      id: true,
      userId: true,
      username: true,
      arabicName: true,
      message: true,
      avatar: true,
      isOffer: true,
      offerAmount: true,
      createdAt: true,
    },
  },
} as const;

@Injectable()
export class LivestreamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLiveStreams() {
    return this.prisma.liveStream.findMany({
      where: { isLive: true, ...notDeleted },
      orderBy: { viewers: 'desc' },
      take: 30,
      select: LIVE_LIST_SELECT,
    });
  }

  findActiveStreamByHost(hostId: string) {
    return this.prisma.liveStream.findFirst({
      where: { hostId, isLive: true, ...notDeleted },
      select: { id: true },
    });
  }

  countListingsBySeller(sellerId: string) {
    return this.prisma.listing.count({ where: { sellerId } });
  }

  findSubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        planId: true,
        renewDate: true,
        autoRenew: true,
        liveMinutesUsed: true,
      },
    });
  }

  createStream(data: Prisma.LiveStreamUncheckedCreateInput) {
    return this.prisma.liveStream.create({
      data,
      select: { id: true, streamKey: true },
    });
  }

  findStreamForStart(id: string) {
    return this.prisma.liveStream.findUnique({
      where: { id },
      select: {
        id: true,
        hostId: true,
        isLive: true,
        title: true,
        arabicTitle: true,
        category: true,
      },
    });
  }

  startStream(id: string) {
    return this.prisma.liveStream.update({
      where: { id },
      data: { isLive: true, startedAt: new Date() },
    });
  }

  findStreamForEnd(id: string) {
    return this.prisma.liveStream.findUnique({
      where: { id },
      select: {
        id: true,
        hostId: true,
        isLive: true,
        startedAt: true,
        viewers: true,
        peakViewers: true,
      },
    });
  }

  setStreamViewers(id: string, viewers: number) {
    return this.prisma.liveStream.updateMany({
      where: { id, isLive: true },
      data: { viewers },
    });
  }

  raisePeakViewers(id: string, viewers: number) {
    return this.prisma.liveStream.updateMany({
      where: { id, isLive: true, peakViewers: { lt: viewers } },
      data: { peakViewers: viewers },
    });
  }

  endStream(id: string, endedAt: Date) {
    return this.prisma.liveStream.update({
      where: { id },
      data: { isLive: false, endedAt, viewers: 0 },
    });
  }

  incrementLiveMinutes(userId: string, minutes: number) {
    return this.prisma.subscription.updateMany({
      where: { userId },
      data: { liveMinutesUsed: { increment: minutes } },
    });
  }

  findStreamForToken(id: string) {
    return this.prisma.liveStream.findUnique({
      where: { id },
      select: {
        id: true,
        hostId: true,
        isLive: true,
        viewers: true,
        hlsUrl: true,
        hlsEgressId: true,
      },
    });
  }

  findStreamForHls(id: string) {
    return this.prisma.liveStream.findUnique({
      where: { id },
      select: {
        id: true,
        hostId: true,
        isLive: true,
        viewers: true,
        hlsUrl: true,
        hlsEgressId: true,
      },
    });
  }

  async sumLiveViewers(): Promise<number> {
    const agg = await this.prisma.liveStream.aggregate({
      where: { isLive: true, ...notDeleted },
      _sum: { viewers: true },
    });
    return agg._sum.viewers ?? 0;
  }

  /** Egress requested: the playlist is NOT exposed to viewers yet. */
  setStreamHlsPreparing(id: string, hlsEgressId: string) {
    return this.prisma.liveStream.updateMany({
      where: { id, isLive: true },
      data: { hlsEgressId, hlsUrl: null },
    });
  }

  /** Playlist verified live: only now may viewers be sent to it. */
  setStreamHlsReady(id: string, hlsEgressId: string, hlsUrl: string) {
    return this.prisma.liveStream.updateMany({
      where: { id, isLive: true, hlsEgressId },
      data: { hlsUrl },
    });
  }

  /** Only clears when the stored egress is the one that ended (ignores stale events). */
  clearStreamHls(id: string, hlsEgressId?: string) {
    return this.prisma.liveStream.updateMany({
      where: { id, ...(hlsEgressId ? { hlsEgressId } : {}) },
      data: { hlsUrl: null, hlsEgressId: null },
    });
  }

  findStreamDetail(id: string) {
    return this.prisma.liveStream.findFirst({
      where: { id, ...notDeleted },
      select: STREAM_DETAIL_SELECT,
    });
  }

  findFollowers(hostId: string, take = 500) {
    return this.prisma.follow.findMany({
      where: { followingId: hostId },
      select: { followerId: true },
      take,
    });
  }
}
