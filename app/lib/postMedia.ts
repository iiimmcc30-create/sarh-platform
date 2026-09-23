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

export type PostMediaType = 'IMAGE' | 'VIDEO';

export type PostMediaRecord = {
  id?: string;
  url: string;
  type: PostMediaType | 'image' | 'video';
  sortOrder?: number;
  posterUrl?: string | null;
};

function trimUri(uri?: string | null): string | undefined {
  const value = typeof uri === 'string' ? uri.trim() : '';
  return value.length > 0 ? value : undefined;
}

export function isFeedVideoUri(uri?: string | null): boolean {
  return isListingVideoUri(uri);
}

function kindFromType(type: PostMediaRecord['type'], url: string): FeedMediaKind {
  const normalized = String(type).toUpperCase();
  if (normalized === 'VIDEO' || type === 'video') return 'video';
  if (normalized === 'IMAGE' || type === 'image') return 'image';
  return isFeedVideoUri(url) ? 'video' : 'image';
}

function fromRecords(media: PostMediaRecord[]): FeedMediaItem[] {
  const items: FeedMediaItem[] = [];
  const seen = new Set<string>();
  const ordered = [...media].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const row of ordered) {
    const uri = trimUri(row.url);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const kind = kindFromType(row.type, uri);
    items.push({
      uri,
      kind,
      posterUri:
        trimUri(row.posterUrl) ??
        (kind === 'video' ? cloudinaryVideoFirstFrameUrl(uri) : undefined),
    });
  }

  const firstImage = items.find((item) => item.kind === 'image');
  return items.map((item) =>
    item.kind === 'video' && !item.posterUri && firstImage
      ? { ...item, posterUri: firstImage.uri }
      : item,
  );
}

function fromLegacy(images?: string[] | null, video?: string | null): FeedMediaItem[] {
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

/** Prefer ordered PostMedia. Legacy `images[]` / `video` remain for old posts. */
export function collectPostMedia(
  images?: string[] | null,
  video?: string | null,
  media?: PostMediaRecord[] | null,
): FeedMediaItem[] {
  if (media && media.length > 0) return fromRecords(media);
  return fromLegacy(images, video);
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
