import {
  clampSearchQuery,
  normalizeArabicSearchText,
  searchTextVariants,
  tokenizeSearchQuery,
} from './arabic-search.util';

describe('normalizeArabicSearchText', () => {
  it('removes tashkeel and normalizes alef variants', () => {
    expect(normalizeArabicSearchText('إِبل')).toBe('ابل');
    expect(normalizeArabicSearchText('آخر')).toBe('اخر');
    expect(normalizeArabicSearchText('أغنام')).toBe('اغنام');
  });

  it('maps alef maqsura and ta marbuta for matching', () => {
    expect(normalizeArabicSearchText('ملحمة')).toBe('ملحمه');
    expect(normalizeArabicSearchText(' على ')).toBe('علي');
    expect(normalizeArabicSearchText('ناقة')).toBe('ناقه');
  });

  it('collapses whitespace', () => {
    expect(normalizeArabicSearchText('  غنم   حري  ')).toBe('غنم حري');
  });

  it('keeps arabic + numbers', () => {
    expect(normalizeArabicSearchText('خروف 50')).toBe('خروف 50');
  });
});

describe('tokenizeSearchQuery', () => {
  it('splits multi-word queries', () => {
    expect(tokenizeSearchQuery('غنم حري')).toEqual(['غنم', 'حري']);
  });

  it('deduplicates tokens', () => {
    expect(tokenizeSearchQuery('غنم غنم')).toEqual(['غنم']);
  });

  it('tokenizes arabic with spaces and numbers', () => {
    expect(tokenizeSearchQuery('خروف 50 كيلو')).toEqual(['خروف', '50', 'كيلو']);
  });
});

describe('searchTextVariants', () => {
  it('expands normalized alef so DB rows with إ/أ/آ still match', () => {
    const variants = searchTextVariants('ابل');
    expect(variants).toEqual(
      expect.arrayContaining(['ابل', 'إبل', 'أبل', 'آبل']),
    );
  });

  it('matches أغنام whether the query uses أ or ا', () => {
    const fromAlef = searchTextVariants('أغنام');
    const fromPlain = searchTextVariants('اغنام');
    expect(fromAlef).toEqual(expect.arrayContaining(['أغنام', 'اغنام']));
    expect(fromPlain).toEqual(expect.arrayContaining(['أغنام', 'اغنام']));
  });

  it('expands ة/ه and ى/ي for marketplace titles', () => {
    const naqa = searchTextVariants('ناقه');
    expect(naqa).toEqual(expect.arrayContaining(['ناقه', 'ناقة']));

    const ala = searchTextVariants('علي');
    expect(ala).toEqual(expect.arrayContaining(['علي', 'على']));
  });

  it('covers partial livestock phrases without changing stored text', () => {
    const variants = searchTextVariants(tokenizeSearchQuery('غنم')[0]);
    expect(variants.some((v) => 'غنم حري'.includes(v))).toBe(true);
  });

  it('supports arabic + numbers tokens', () => {
    const variants = searchTextVariants('خروف 50');
    expect(variants.some((v) => v.includes('50'))).toBe(true);
    expect(variants.some((v) => v.includes('خروف'))).toBe(true);
  });

  it('bounds variant expansion', () => {
    expect(searchTextVariants('اااااااا').length).toBeLessThanOrEqual(24);
  });
});

describe('clampSearchQuery', () => {
  it('trims and limits length', () => {
    expect(clampSearchQuery('  abc  ')).toBe('abc');
    expect(clampSearchQuery('x'.repeat(200)).length).toBe(120);
  });
});

describe('arabic marketplace search scenarios', () => {
  function matchesStoredTitle(query: string, storedTitle: string): boolean {
    const tokens = tokenizeSearchQuery(query);
    if (tokens.length === 0) return false;
    return tokens.every((token) =>
      searchTextVariants(token).some((variant) =>
        storedTitle.includes(variant),
      ),
    );
  }

  it('exact arabic match with alef variants', () => {
    expect(matchesStoredTitle('إبل', 'إبل للبيع')).toBe(true);
    expect(matchesStoredTitle('ابل', 'إبل للبيع')).toBe(true);
    expect(matchesStoredTitle('ابل', 'أبل للبيع')).toBe(true);
    expect(matchesStoredTitle('ابل', 'آبل للبيع')).toBe(true);
    expect(matchesStoredTitle('ابل', 'ابل للبيع')).toBe(true);
    expect(matchesStoredTitle('أغنام', 'أغنام نعيمي')).toBe(true);
    expect(matchesStoredTitle('اغنام', 'أغنام نعيمي')).toBe(true);
  });

  it('partial arabic match', () => {
    expect(matchesStoredTitle('غنم', 'غنم حري أصيل')).toBe(true);
    expect(matchesStoredTitle('حري', 'غنم حري أصيل')).toBe(true);
  });

  it('multiple arabic words with spaces', () => {
    expect(matchesStoredTitle('غنم حري', 'غنم حري أصيل')).toBe(true);
    expect(matchesStoredTitle('  غنم   حري  ', 'غنم حري أصيل')).toBe(true);
  });

  it('arabic normalization for tashkeel and ta marbuta', () => {
    expect(matchesStoredTitle('إِبل', 'إبل')).toBe(true);
    expect(matchesStoredTitle('ناقه', 'ناقة للبيع')).toBe(true);
    expect(matchesStoredTitle('ناقة', 'ناقه للبيع')).toBe(true);
  });

  it('arabic + numbers', () => {
    expect(matchesStoredTitle('خروف 50', 'خروف 50 كيلو')).toBe(true);
    expect(matchesStoredTitle('50', 'خروف 50 كيلو')).toBe(true);
  });
});
