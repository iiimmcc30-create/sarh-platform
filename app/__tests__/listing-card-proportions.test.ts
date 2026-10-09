import {
  listingListMetrics,
  listingListRowPitch,
  LISTING_LIST_RATIOS,
} from '../components/feature/listingCardLayout';
import { CLOUDINARY_FIT } from '../lib/listingMedia';

describe('ListingCard list row — Haraj reference proportions', () => {
  it('card height ≈ 0.329 × card width with a full-bleed square image', () => {
    for (const w of [360, 390, 430]) {
      const m = listingListMetrics(w);
      expect(m.cardWidth).toBe(w - m.marginHorizontal * 2);
      expect(Math.abs(m.cardHeight / m.cardWidth - LISTING_LIST_RATIOS.cardHeightOfCardWidth)).toBeLessThan(0.005);
      expect(m.image).toBe(m.cardHeight);
    }
  });

  it('pins the computed pt values at 360 / 390 / 430', () => {
    expect(listingListMetrics(360)).toMatchObject({ cardHeight: 114, radius: 10.5, gap: 4, titleFontSize: 12, metaFontSize: 11, avatar: 25 });
    expect(listingListMetrics(390)).toMatchObject({ cardHeight: 123, radius: 11.5, gap: 4.5, titleFontSize: 13.5, metaFontSize: 12, avatar: 27 });
    expect(listingListMetrics(430)).toMatchObject({ cardHeight: 136, radius: 12.5, gap: 4.5, titleFontSize: 14.5, metaFontSize: 13.5, avatar: 30 });
  });

  it('clamps to phone widths and keeps the feed row pitch in sync', () => {
    expect(listingListMetrics(1200).cardHeight).toBe(listingListMetrics(500).cardHeight);
    expect(listingListMetrics(200).cardHeight).toBe(listingListMetrics(320).cardHeight);
    const m = listingListMetrics(390);
    expect(listingListRowPitch(390)).toBe(m.cardHeight + m.gap);
  });

  it('title + meta + avatar fit inside the padded text column', () => {
    for (const w of [320, 360, 390, 430, 500]) {
      const m = listingListMetrics(w);
      const inner = m.cardHeight - m.paddingVertical * 2;
      expect(m.titleLineHeight * 2 + Math.max(m.metaIcon, m.metaLineHeight) + m.avatar).toBeLessThanOrEqual(inner);
    }
  });

  it('requests a 300×300 crop-fill image for the full-bleed box', () => {
    expect(CLOUDINARY_FIT.listBleed).toEqual(['w_300', 'h_300', 'c_fill', 'q_auto', 'f_auto']);
  });
});
