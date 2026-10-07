import { readFileSync } from 'fs';
import path from 'path';

jest.mock('@/services/listings', () => ({
  searchListingsPage: jest.fn(),
}));

import { searchListingsPage } from '@/services/listings';
import {
  SIMILAR_LISTINGS_LIMIT,
  chunkIntoRows,
  fetchSimilarListings,
  pickSimilarListings,
  similarListingsQueries,
} from '@/lib/similarListings';
import type { Listing } from '@/services/types';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const mockedSearch = searchListingsPage as jest.MockedFunction<typeof searchListingsPage>;

function row(id: string, extra: Partial<Listing> = {}): Listing {
  return {
    id,
    title: `t-${id}`,
    arabicTitle: `عنوان ${id}`,
    category: 'camels',
    country: 'SA',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    images: [],
    ...extra,
  } as unknown as Listing;
}

const current = row('cur', { categoryId: 'cat-1', subcategoryId: 'sub-1' });

describe('similar listings data', () => {
  beforeEach(() => mockedSearch.mockReset());

  it('queries narrowest → broadest on the existing listings feed', () => {
    expect(similarListingsQueries(current)).toEqual([
      { subcategoryId: 'sub-1' },
      { categoryId: 'cat-1' },
      { category: 'camels' },
    ]);
    expect(similarListingsQueries(row('x'))).toEqual([{ category: 'camels' }]);
  });

  it('drops the current listing, duplicates and other countries; same city first', () => {
    const picked = pickSimilarListings(current, [
      row('cur'),
      row('a', { arabicLocation: 'جدة' }),
      row('b'),
      row('b'),
      row('eg', { country: 'EG' } as Partial<Listing>),
      row('c'),
    ]);
    expect(picked.map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('caps the grid and stops widening once full', async () => {
    const many = Array.from({ length: 20 }, (_, i) => row(`s${i}`));
    mockedSearch.mockResolvedValueOnce({ listings: many, nextCursor: null, hasMore: false });
    const result = await fetchSimilarListings(current, 'tok');
    expect(result).toHaveLength(SIMILAR_LISTINGS_LIMIT);
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch).toHaveBeenCalledWith({ subcategoryId: 'sub-1' }, 'tok');
  });

  it('widens to the category when the subcategory is thin', async () => {
    mockedSearch
      .mockResolvedValueOnce({ listings: [row('cur'), row('a')], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ listings: [row('a'), row('b')], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ listings: [row('c')], nextCursor: null, hasMore: false });
    const result = await fetchSimilarListings(current);
    expect(result.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(mockedSearch).toHaveBeenCalledTimes(3);
  });

  it('a failed request ends quietly (section hides when empty)', async () => {
    mockedSearch.mockRejectedValueOnce(new Error('listings_fetch_failed'));
    await expect(fetchSimilarListings(current)).resolves.toEqual([]);
  });

  it('rows of three, last row padded so tiles keep their width', () => {
    expect(chunkIntoRows([1, 2, 3, 4])).toEqual([
      [1, 2, 3],
      [4, null, null],
    ]);
    expect(chunkIntoRows([])).toEqual([]);
  });
});

describe('similar listings UI', () => {
  it('square tiles with a one-line title, plain rows inside the ScrollView', () => {
    const s = src('components/listing/SimilarListingsSection.tsx');
    expect(s).toContain("SIMILAR_LISTINGS_TITLE = 'إعلانات مشابهة'");
    expect(s).toContain('aspectRatio: 1');
    expect(s).toContain('numberOfLines={1}');
    expect(s).toContain('<SpringPressable');
    expect(s).toContain('quickAccessBorderColor');
    expect(s).toContain('if (items && items.length === 0) return null;');
    expect(s).not.toMatch(/<FlatList|LinearGradient|shadowOpacity/);
  });

  it('listing detail shows the section at the bottom, after the comments', () => {
    const screen = src('app/listing/[id].tsx');
    const comments = screen.indexOf('<ListingCommentsSection');
    const similar = screen.indexOf('<SimilarListingsSection listing={listing} />');
    expect(comments).toBeGreaterThan(-1);
    expect(similar).toBeGreaterThan(comments);
  });
});
