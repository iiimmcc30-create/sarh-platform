import { MARKET_CATEGORIES_FALLBACK, resolveCategoryChipDisplay } from '../lib/marketCategoriesFallback';
import {
  classifyListingTitle,
  findCategoryBySlug,
  suggestionMode,
} from '../lib/categoryIntelligence';
import { normalizeArabic } from '../lib/arabicNormalize';

const cats = MARKET_CATEGORIES_FALLBACK;

function classify(title: string) {
  return classifyListingTitle(title, { categories: cats });
}

describe('arabicNormalize', () => {
  it('treats hamza and taa marbuta variants as equal', () => {
    expect(normalizeArabic('أغنام')).toBe(normalizeArabic('اغنام'));
    expect(normalizeArabic('الأغنام')).toContain('اغنام');
    expect(normalizeArabic('ناقة')).toBe(normalizeArabic('ناقه'));
  });
});

describe('classifyListingTitle', () => {
  it('maps livestock titles to المواشي', () => {
    for (const title of ['أغنام للبيع', 'نعاج حريات', 'تيوس للبيع', 'حلال للبيع', 'جمل للبيع', 'ناقة']) {
      const r = classify(title);
      expect(r?.parentSlug).toBe('livestock');
      expect(suggestionMode(r)).toBe('auto');
    }
  });

  it('maps feed titles to الأعلاف', () => {
    for (const title of ['شعير', 'برسيم', 'تبن', 'علف أغنام', 'شعير ممتاز للبيع']) {
      const r = classify(title);
      expect(r?.parentSlug).toBe('feed');
      expect(suggestionMode(r)).not.toBe('none');
    }
  });

  it('maps feeder titles to المعدات not المواشي', () => {
    const r = classify('معلف أغنام');
    expect(r?.parentSlug).toBe('equipment');
    expect(r?.childSlug).toBe('feeders-drinkers');
  });

  it('does not classify livestock transport as livestock', () => {
    const r = classify('سيارة نقل أغنام');
    expect(r?.parentSlug).toBe('transport');
  });

  it('maps fridge display to equipment', () => {
    const r = classify('ثلاجة عرض');
    expect(r?.parentSlug).toBe('equipment');
  });

  it('returns null for empty or vague titles', () => {
    expect(classify('')).toBeNull();
    expect(classify('للبيع')).toBeNull();
  });

  it('resolves slugs against the live taxonomy', () => {
    const found = findCategoryBySlug(cats, 'livestock', 'sheep');
    expect(found?.parent.nameAr).toBe('المواشي');
    expect(found?.child?.nameAr).toBe('أغنام');
  });
});

describe('resolveCategoryChipDisplay', () => {
  it('falls back to bundled emoji/icons for parent market slugs', () => {
    expect(resolveCategoryChipDisplay({ slug: 'livestock', emoji: null, icon: null }).emoji).toBe('🐪');
    expect(resolveCategoryChipDisplay({ slug: 'feed', emoji: null, icon: null }).emoji).toBe('🌾');
    expect(resolveCategoryChipDisplay({ slug: 'transport', emoji: null, icon: null }).emoji).toBe('🚚');
    expect(resolveCategoryChipDisplay({ slug: 'slaughter', emoji: null, icon: null }).emoji).toBe('🥩');
    expect(resolveCategoryChipDisplay({ slug: 'equipment', emoji: null, icon: null }).emoji).toBe('🔧');
  });
});
