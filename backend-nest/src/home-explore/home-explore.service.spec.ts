import { Test } from '@nestjs/testing';
import { HomeExploreService } from './home-explore.service';
import { PaidServicesService } from '../settings/paid-services.service';
import { PrismaService } from '../prisma/prisma.service';
import { HOME_EXPLORE_CATALOG } from './home-explore.catalog';

describe('HomeExploreService', () => {
  let service: HomeExploreService;
  const prisma = {
    appSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const paidServices = {
    getFlags: jest.fn().mockResolvedValue({
      promotionEnabled: false,
      pinEnabled: false,
      featureEnabled: false,
      listingFeesEnabled: true,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.appSetting.upsert.mockImplementation(
      async ({ create, update }: any) => ({
        value: update?.value ?? create.value,
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        HomeExploreService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaidServicesService, useValue: paidServices },
      ],
    }).compile();
    service = moduleRef.get(HomeExploreService);
  });

  it('seeds default destinations without exposing promote when paid services are off', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    const sections = await service.listPublic();
    expect(sections.map((s) => s.destination)).toEqual([
      'community',
      'listings',
      'services',
      'news',
    ]);
    expect(sections.find((s) => s.destination === 'promote')).toBeUndefined();
  });

  it('returns catalog routes from known destinations only', () => {
    expect(HOME_EXPLORE_CATALOG.map((c) => c.key)).toEqual([
      'community',
      'listings',
      'services',
      'news',
      'live',
      'promote',
    ]);
    expect(HOME_EXPLORE_CATALOG.find((c) => c.key === 'listings')?.route).toBe(
      '/(tabs)/market',
    );
    expect(HOME_EXPLORE_CATALOG.find((c) => c.key === 'community')?.route).toBe(
      '/(tabs)/posts',
    );
  });

  it('hides promote from the admin catalog when paid services are disabled', () => {
    expect(service.catalog(false).some((c) => c.key === 'promote')).toBe(false);
    expect(service.catalog(true).some((c) => c.key === 'promote')).toBe(true);
  });

  it('reorders and toggles without inventing destinations', async () => {
    let stored = {
      items: [
        { id: 'a', destination: 'community', sortOrder: 0, isActive: true },
        { id: 'b', destination: 'listings', sortOrder: 1, isActive: true },
      ],
    };
    prisma.appSetting.findUnique.mockImplementation(async () => ({
      value: stored,
    }));
    prisma.appSetting.upsert.mockImplementation(async ({ update }: any) => {
      stored = update.value;
      return { value: stored };
    });
    const reordered = await service.reorder(['b', 'a']);
    expect(reordered.map((s) => s!.destination)).toEqual([
      'listings',
      'community',
    ]);
    const toggled = await service.update('b', { isActive: false });
    expect(toggled.find((s) => s!.id === 'b')?.isActive).toBe(false);
    const publicList = await service.listPublic();
    expect(publicList.map((s) => s.destination)).toEqual(['community']);
  });
});
