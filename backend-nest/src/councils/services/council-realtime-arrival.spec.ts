import { CouncilRealtimeService } from './council-realtime.service';

const COUNCIL = 'c1';

function setup(user: Record<string, unknown> | null) {
  const claims = new Set<string>();
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  };
  const cache = {
    claimOnce: jest.fn(async (key: string) => {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    }),
  };
  const bridge = { toCouncil: jest.fn(), toUser: jest.fn() };
  const service = new CouncilRealtimeService(
    prisma as never,
    cache as never,
    {} as never,
    bridge as never,
  );
  return { service, prisma, cache, bridge, claims };
}

const gold = {
  id: 'u1',
  username: 'gold',
  displayName: null,
  arabicName: 'ذهبي',
  avatar: null,
  verified: true,
  verifiedTier: 'gold',
};

describe('CouncilRealtimeService.announceArrival', () => {
  it('broadcasts a Gold subscriber entrance with public fields only', async () => {
    const { service, bridge, prisma } = setup(gold);
    await service.announceArrival(COUNCIL, 'u1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(bridge.toCouncil).toHaveBeenCalledWith(COUNCIL, 'council:arrival', {
      councilId: COUNCIL,
      user: gold,
    });
  });

  it('never repeats for the same user (socket reconnects)', async () => {
    const { service, bridge, claims } = setup(gold);
    await service.announceArrival(COUNCIL, 'u1');
    claims.delete(`council:arrival-gap:${COUNCIL}`);
    await service.announceArrival(COUNCIL, 'u1');
    expect(bridge.toCouncil).toHaveBeenCalledTimes(1);
  });

  it('drops entrances inside the per-council gap', async () => {
    const { service, bridge, prisma } = setup(gold);
    await service.announceArrival(COUNCIL, 'u1');
    prisma.user.findUnique.mockResolvedValueOnce({ ...gold, id: 'u2' });
    await service.announceArrival(COUNCIL, 'u2');
    expect(bridge.toCouncil).toHaveBeenCalledTimes(1);
  });

  it('stays silent for Blue, legacy verified and free users', async () => {
    for (const u of [
      { ...gold, verifiedTier: 'blue' },
      { ...gold, verifiedTier: null },
      { ...gold, verified: false },
      null,
    ]) {
      const { service, bridge, cache } = setup(u);
      await service.announceArrival(COUNCIL, 'u1');
      expect(bridge.toCouncil).not.toHaveBeenCalled();
      expect(cache.claimOnce).not.toHaveBeenCalled();
    }
  });
});
