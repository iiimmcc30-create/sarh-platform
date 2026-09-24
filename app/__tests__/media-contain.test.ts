import {
  containSize,
  containSizeFromRatio,
  detailMediaHeight,
  isKnownAspect,
  normalizeAspectRatio,
} from '@/lib/mediaContain';

describe('media contain boxes', () => {
  const phone = { width: 390, height: 844 };

  it('fits 9:16 without crop on a portrait phone', () => {
    const box = containSize(1080, 1920, phone.width, phone.height);
    expect(box.width).toBeCloseTo(390, 5);
    expect(box.height).toBeCloseTo(390 * (16 / 9), 5);
    expect(box.width).toBeLessThanOrEqual(phone.width + 0.01);
    expect(box.height).toBeLessThanOrEqual(phone.height + 0.01);
    expect(box.width / box.height).toBeCloseTo(9 / 16, 5);
  });

  it('fits 16:9 without crop on a portrait phone', () => {
    const box = containSize(1920, 1080, phone.width, phone.height);
    expect(box.width).toBeCloseTo(390, 5);
    expect(box.height).toBeCloseTo(390 * (9 / 16), 5);
    expect(box.width / box.height).toBeCloseTo(16 / 9, 5);
    expect(box.height).toBeLessThan(phone.height);
  });

  it('fits 1:1 without crop', () => {
    const box = containSize(1200, 1200, phone.width, phone.height);
    expect(box.width).toBeCloseTo(390, 5);
    expect(box.height).toBeCloseTo(390, 5);
    expect(box.width / box.height).toBeCloseTo(1, 5);
  });

  it('keeps 16:9 letterboxed on a tall frame', () => {
    const box = containSizeFromRatio(16 / 9, 400, 800);
    expect(box.width).toBe(400);
    expect(box.height).toBeCloseTo(225, 5);
  });

  it('does not invent a ratio from invalid sizes', () => {
    expect(normalizeAspectRatio(0, 1080)).toBeNull();
    expect(normalizeAspectRatio(1920, -1)).toBeNull();
  });

  it('caps inline detail height without changing the stored ratio', () => {
    const uncapped = detailMediaHeight(9 / 16, 390, 900);
    expect(uncapped).toBeCloseTo(390 * (16 / 9), 5);
    const tall = detailMediaHeight(9 / 16, 390, 844 * 0.82);
    expect(tall).toBeCloseTo(844 * 0.82, 5);
    const capped = detailMediaHeight(9 / 16, 390, 500);
    expect(capped).toBe(500);
    expect(isKnownAspect(9 / 16, 9 / 16)).toBe(true);
  });
});
