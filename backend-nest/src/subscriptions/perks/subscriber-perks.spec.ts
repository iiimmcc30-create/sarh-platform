import {
  activeSubscriberTier,
  canHostFollowersOnlyCouncils,
  canScheduleCouncils,
  canSeeProfileViewers,
  goldSellersFirst,
  isGoldSeller,
  weeklyFreeBoostsFor,
} from './subscriber-perks';

describe('subscriber perks', () => {
  it('resolves the tier from the effective plan slug only', async () => {
    const ent = (slug: string) => ({
      getEffectivePlanSlugForUser: jest.fn().mockResolvedValue(slug),
    });
    await expect(activeSubscriberTier(ent('gold-badge'), 'u')).resolves.toBe(
      'gold',
    );
    await expect(
      activeSubscriberTier(ent('blue-plus-badge'), 'u'),
    ).resolves.toBe('blue_plus');
    await expect(activeSubscriberTier(ent('blue-badge'), 'u')).resolves.toBe(
      'blue',
    );
    await expect(activeSubscriberTier(ent('free'), 'u')).resolves.toBeNull();
    await expect(
      activeSubscriberTier(ent('sarh-pro'), 'u'),
    ).resolves.toBeNull();
  });

  it('gates each perk by tier', () => {
    expect(canSeeProfileViewers(null)).toBe(false);
    expect(
      ['blue', 'blue_plus', 'gold'].every((t) =>
        canSeeProfileViewers(t as never),
      ),
    ).toBe(true);
    expect(canScheduleCouncils('blue')).toBe(false);
    expect(canScheduleCouncils('blue_plus')).toBe(true);
    expect(canScheduleCouncils('gold')).toBe(true);
    expect(canHostFollowersOnlyCouncils('blue_plus')).toBe(false);
    expect(canHostFollowersOnlyCouncils('gold')).toBe(true);
  });

  it('weekly free boosts: Blue 0, Blue+ 2, Gold 4, plan value wins', () => {
    expect(weeklyFreeBoostsFor(null, 9)).toBe(0);
    expect(weeklyFreeBoostsFor('blue', undefined)).toBe(0);
    expect(weeklyFreeBoostsFor('blue_plus', undefined)).toBe(2);
    expect(weeklyFreeBoostsFor('gold', undefined)).toBe(4);
    expect(weeklyFreeBoostsFor('gold', 6)).toBe(6);
    expect(weeklyFreeBoostsFor('blue_plus', '3')).toBe(3);
    expect(weeklyFreeBoostsFor('gold', -2)).toBe(0);
  });

  it('gold seller = public gold badge; gold-first is stable', () => {
    expect(isGoldSeller({ verified: true, verifiedTier: 'gold' })).toBe(true);
    expect(isGoldSeller({ verified: false, verifiedTier: 'gold' })).toBe(false);
    expect(isGoldSeller({ verified: true, verifiedTier: 'blue_plus' })).toBe(
      false,
    );
    const rows = [
      { id: 'a', s: { verified: true, verifiedTier: 'blue' } },
      { id: 'b', s: { verified: true, verifiedTier: 'gold' } },
      { id: 'c', s: null },
      { id: 'd', s: { verified: true, verifiedTier: 'gold' } },
    ];
    expect(goldSellersFirst(rows, (r) => r.s).map((r) => r.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });
});
