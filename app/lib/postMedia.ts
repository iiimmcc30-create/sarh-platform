import {
  cloudinaryVideoFirstFrameUrl,
  isListingVideoUri,
} from '@/lib/listingMedia';

export type FeedMediaKind = 'image' | 'video';

export type FeedMediaItem = {
  uri: string;
  kind: FeedMediaKind;
  posterUri?: string;
};

function trimUri(uri?: string | null): string | undefined {
  const value = typeof uri === 'string' ? uri.trim() : '';
  return value.length > 0 ? value : undefined;
}

export function isFeedVideoUri(uri?: string | null): boolean {
  return isListingVideoUri(uri);
}

export function collectPostMedia(
  images?: string[] | null,
  video?: string | null,
): FeedMediaItem[] {
  const items: FeedMediaItem[] = [];
  const seen = new Set<string>();

  const push = (raw?: string | null) => {
    const uri = trimUri(raw);
    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    if (isFeedVideoUri(uri)) {
      items.push({
        uri,
        kind: 'video',
        posterUri: cloudinaryVideoFirstFrameUrl(uri),
      });
      return;
    }
    items.push({ uri, kind: 'image' });
  };

  for (const image of images ?? []) push(image);
  push(video);

  const firstImage = items.find((item) => item.kind === 'image');
  return items.map((item) =>
    item.kind === 'video' && !item.posterUri && firstImage
      ? { ...item, posterUri: firstImage.uri }
      : item,
  );
}

export function collectListingMedia(listing: {
  images?: string[] | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}): FeedMediaItem[] {
  const items = collectPostMedia(listing.images, listing.videoUrl);
  const thumb = trimUri(listing.thumbnailUrl);
  if (!thumb) return items;
  return items.map((item) =>
    item.kind === 'video' ? { ...item, posterUri: thumb } : item,
  );
}
