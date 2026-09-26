import {
  cloudinaryVideoFirstFrameUrl,
  isListingVideoUri,
  listingPhotoUris,
  listingVideoUrl,
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
  // The dedicated `video` field is authoritative: it is a video even when the URL
  // has no extension / `/video/` hint (e.g. `/uploads/abc` or an API stream URL).
  // Re-detecting it by URL pattern used to turn it into `kind: 'image'`, which made
  // the Media Viewer open the listing/post video as a still image.
  const explicitVideo = trimUri(video);
  if (explicitVideo) seen.add(explicitVideo);

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
  if (explicitVideo) {
    items.push({
      uri: explicitVideo,
      kind: 'video',
      posterUri: cloudinaryVideoFirstFrameUrl(explicitVideo),
    });
  }

  const firstImage = items.find((item) => item.kind === 'image');
  return items.map((item) =>
    item.kind === 'video' && !item.posterUri && firstImage
      ? { ...item, posterUri: firstImage.uri }
      : item,
  );
}

/** Viewer index for the listing video preview press (the video item, never a photo). */
export function listingVideoViewerIndex(items: FeedMediaItem[], videoUri?: string | null): number {
  const target = trimUri(videoUri);
  const exact = target
    ? items.findIndex((item) => item.kind === 'video' && item.uri === target)
    : -1;
  if (exact >= 0) return exact;
  return items.findIndex((item) => item.kind === 'video');
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
  const photos = listingPhotoUris({ images: listing.images ?? [] });
  const video = listingVideoUrl({
    images: listing.images ?? [],
    videoUrl: listing.videoUrl ?? undefined,
  });
  const items = collectPostMedia(photos, video);
  const thumb = trimUri(listing.thumbnailUrl);
  if (!thumb) return items;
  return items.map((item) =>
    item.kind === 'video' ? { ...item, posterUri: thumb } : item,
  );
}
