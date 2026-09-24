import {
  detailMediaMaxHeight,
  resolveMediaLayoutRatio,
} from '@/lib/mediaAspectRatio';

describe('resolveMediaLayoutRatio', () => {
  it('prefers natural over cached and poster', () => {
    expect(
      resolveMediaLayoutRatio({
        naturalRatio: 9 / 16,
        cachedRatio: 16 / 9,
        posterRatio: 1,
      }).layoutRatio,
    ).toBeCloseTo(9 / 16, 5);
  });

  it('uses cached before poster and avoids 16:9 while waiting', () => {
    expect(
      resolveMediaLayoutRatio({
        naturalRatio: null,
        cachedRatio: 4 / 3,
        posterRatio: 1,
      }).layoutRatio,
    ).toBeCloseTo(4 / 3, 5);
    const waiting = resolveMediaLayoutRatio({
      naturalRatio: null,
      cachedRatio: null,
      posterRatio: null,
    });
    expect(waiting.layoutRatio).toBeNull();
    expect(waiting.awaitingMetadata).toBe(true);
  });
});

describe('detailMediaMaxHeight', () => {
  it('caps tall portrait detail without using 82% as the only rule', () => {
    const cap = detailMediaMaxHeight(844, 390);
    expect(cap).toBeLessThan(844 * 0.82);
    expect(cap).toBeGreaterThan(390 / (16 / 9));
  });
});
