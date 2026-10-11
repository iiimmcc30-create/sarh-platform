import AsyncStorage from '@react-native-async-storage/async-storage';
import { togglePinnedId } from '@/lib/collectionLists';

const KEY = 'sarh.collectionPins.v1';

export async function loadPinnedCollectionIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function setCollectionPinned(id: string, pinned: boolean): Promise<string[]> {
  const current = await loadPinnedCollectionIds();
  const next = togglePinnedId(current, id, pinned);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
