import AsyncStorage from '@react-native-async-storage/async-storage';

const LISTING_FAVORITES_KEY = '@sarh/listing-favorites-v1';

export async function getListingFavoriteIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LISTING_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function isListingFavorited(listingId: string): Promise<boolean> {
  const ids = await getListingFavoriteIds();
  return ids.includes(listingId);
}

/**
 * Toggle favorite status for a listing.
 * Returns the NEW favorited state (true = now saved, false = now removed).
 */
export async function toggleListingFavorite(listingId: string): Promise<boolean> {
  const ids = await getListingFavoriteIds();
  const already = ids.includes(listingId);
  const next = already ? ids.filter((id) => id !== listingId) : [listingId, ...ids];
  await AsyncStorage.setItem(LISTING_FAVORITES_KEY, JSON.stringify(next));
  return !already;
}
