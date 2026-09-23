import { SAUDI_REGIONS, resolveSaudiMainCities } from '../constants/saudiRegions';
import {
  listingMatchesRegionSelection,
  regionMatchTokens,
  regionSelectionLabel,
  resolveNearbyRegionSelection,
} from '../lib/saudiRegionSearch';

describe('saudi region filter matching', () => {
  const riyadh = SAUDI_REGIONS.find((r) => r.id === 'riyadh')!;
  const eastern = SAUDI_REGIONS.find((r) => r.id === 'eastern')!;
  const qassim = SAUDI_REGIONS.find((r) => r.id === 'qassim')!;
  const zulfi = riyadh.cities.find((c) => c.id === 'zulfi')!;
  const hafr = eastern.cities.find((c) => c.id === 'hafr-albatin')!;

  it('matches region filter by city name inside that region', () => {
    expect(
      listingMatchesRegionSelection('الزلفي', { type: 'region', region: riyadh }),
    ).toBe(true);
    expect(
      listingMatchesRegionSelection('حفرالباطن', { type: 'region', region: eastern }),
    ).toBe(true);
    expect(
      listingMatchesRegionSelection('القصيم', { type: 'region', region: qassim }),
    ).toBe(true);
  });

  it('matches exact city filter and rejects other cities', () => {
    expect(
      listingMatchesRegionSelection('الزلفي', {
        type: 'city',
        region: riyadh,
        city: zulfi,
      }),
    ).toBe(true);
    expect(
      listingMatchesRegionSelection('الرياض', {
        type: 'city',
        region: riyadh,
        city: zulfi,
      }),
    ).toBe(false);
    expect(
      listingMatchesRegionSelection('حفر الباطن', {
        type: 'city',
        region: eastern,
        city: hafr,
      }),
    ).toBe(true);
  });

  it('keeps all-regions open and labels selections', () => {
    expect(listingMatchesRegionSelection('أي مكان', { type: 'all' })).toBe(true);
    expect(regionSelectionLabel({ type: 'all' })).toBe('كل المناطق');
    expect(regionSelectionLabel({ type: 'region', region: eastern })).toContain('الشرقية');
    expect(regionMatchTokens(qassim)).toContain('القصيم');
  });

  it('resolves featured main cities for the empty region state', () => {
    expect(resolveSaudiMainCities().map((c) => c.city.nameAr)).toEqual([
      'الدمام',
      'الرياض',
      'جدة',
      'المدينة المنورة',
      'مكة المكرمة',
    ]);
  });

  it('maps device geocode places onto catalog cities so nearby actually matches listings', () => {
    const riyadh = resolveNearbyRegionSelection({ city: 'Riyadh' });
    expect(riyadh).toEqual({
      type: 'city',
      region: expect.objectContaining({ id: 'riyadh' }),
      city: expect.objectContaining({ id: 'riyadh-city', nameAr: 'الرياض' }),
    });
    expect(listingMatchesRegionSelection('الرياض، منطقة الرياض', riyadh!)).toBe(true);
    expect(listingMatchesRegionSelection('جدة', riyadh!)).toBe(false);

    const jeddah = resolveNearbyRegionSelection({ city: 'Jeddah', region: 'Makkah' });
    expect(jeddah?.type).toBe('city');
    expect(jeddah && jeddah.type === 'city' ? jeddah.city.nameAr : null).toBe('جدة');

    const eastern = resolveNearbyRegionSelection({ region: 'Eastern Province' });
    expect(eastern?.type).toBe('region');
    expect(eastern && eastern.type === 'region' ? eastern.region.id : null).toBe('eastern');
    expect(listingMatchesRegionSelection('الدمام', eastern!)).toBe(true);

    expect(resolveNearbyRegionSelection({ city: 'Atlantis' })).toBeNull();
  });
});
