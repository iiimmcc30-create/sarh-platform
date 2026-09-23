import { Image } from 'expo-image';
import { InteractionManager } from 'react-native';
import { resolveMediaUrl } from '@/services/media';

/** Warm expo-image disk/memory cache after first paint — no UI. */
export function prefetchRemoteImages(
  uris: Array<string | undefined | null>,
  limit = 10,
): void {
  const resolved: string[] = [];
  for (const raw of uris) {
    if (resolved.length >= limit) break;
    const uri = resolveMediaUrl(raw);
    if (uri) resolved.push(uri);
  }
  if (resolved.length === 0) return;

  const run = () => {
    for (const uri of resolved) {
      void Image.prefetch(uri);
    }
  };

  InteractionManager.runAfterInteractions(run);
}
