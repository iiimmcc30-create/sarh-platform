import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sarouh:message_listing_context_v1';

export type MessageListingPreview = {
  listingId: string;
  title: string;
  price: number;
  currency?: string;
  image?: string;
  location?: string;
  peerUserId: string;
};

type Store = Record<string, MessageListingPreview>;

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveMessageListingContext(
  preview: MessageListingPreview,
): Promise<void> {
  if (!preview.peerUserId || !preview.listingId) return;
  const store = await readStore();
  store[preview.peerUserId] = preview;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function getMessageListingContext(
  peerUserId?: string | null,
): Promise<MessageListingPreview | null> {
  if (!peerUserId) return null;
  const store = await readStore();
  return store[peerUserId] ?? null;
}

export async function getAllMessageListingContexts(): Promise<Store> {
  return readStore();
}

export function formatListingPrice(
  price: number,
  currency = 'SAR',
): string {
  const formatted = Number.isFinite(price)
    ? price.toLocaleString('en-US')
    : String(price);
  return currency === 'SAR' ? `${formatted} ر.س` : `${formatted} ${currency}`;
}
