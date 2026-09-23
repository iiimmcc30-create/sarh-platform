import {
  isListingFavorited,
  toggleListingFavorite,
  getListingFavoriteIds,
} from '@/lib/listingFavorite';

// AsyncStorage is auto-mocked by the Jest preset
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('listing favorites (local storage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false for an unknown listing', async () => {
    const result = await isListingFavorited('unknown-id');
    expect(result).toBe(false);
  });

  it('toggles from false to true then back to false', async () => {
    const first = await toggleListingFavorite('listing-1');
    expect(first).toBe(true);

    const second = await toggleListingFavorite('listing-1');
    expect(second).toBe(false);
  });

  it('persists favorited ids across calls', async () => {
    await toggleListingFavorite('listing-a');
    await toggleListingFavorite('listing-b');
    const ids = await getListingFavoriteIds();
    expect(ids).toContain('listing-a');
    expect(ids).toContain('listing-b');
  });
});
