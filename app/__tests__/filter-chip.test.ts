import { FILTER_CHIP } from '../components/ui/filterChipTokens';

describe('FilterChip tokens', () => {
  it('keeps a fixed height and content-driven horizontal padding', () => {
    expect(FILTER_CHIP.height).toBeGreaterThanOrEqual(44);
    expect(FILTER_CHIP.height).toBeLessThanOrEqual(48);
    expect(FILTER_CHIP.paddingHorizontal).toBeGreaterThanOrEqual(20);
    expect(FILTER_CHIP.paddingHorizontal).toBeLessThanOrEqual(24);
    expect(FILTER_CHIP.radius).toBeGreaterThanOrEqual(14);
    expect(FILTER_CHIP.radius).toBeLessThanOrEqual(16);
    expect(FILTER_CHIP.gap).toBeGreaterThanOrEqual(8);
    expect(FILTER_CHIP.gap).toBeLessThanOrEqual(12);
  });

  it('uses a dark idle surface near the messages reference', () => {
    expect(FILTER_CHIP.idleSurfaceFallback.toLowerCase()).toBe('#101f2c');
  });

  it('keeps compact market chip tokens for region and category rows', () => {
    const { MARKET_CHIP } = require('../components/ui/filterChipTokens');
    expect(MARKET_CHIP.height).toBeGreaterThanOrEqual(32);
    expect(MARKET_CHIP.height).toBeLessThanOrEqual(36);
    expect(MARKET_CHIP.fontSize).toBeLessThanOrEqual(13);
  });
});
