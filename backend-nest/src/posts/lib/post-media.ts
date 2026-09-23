export const POST_MEDIA_TYPES = ['IMAGE', 'VIDEO'] as const;
export type PostMediaKind = (typeof POST_MEDIA_TYPES)[number];

export const MAX_POST_MEDIA = 8;

export type IncomingPostMedia = {
  url: string;
  type: PostMediaKind;
  sortOrder?: number;
};

export type NormalizedPostMedia = {
  url: string;
  type: PostMediaKind;
  sortOrder: number;
};

export function normalizeImages(
  image?: string | null,
  images?: string[],
): string[] {
  if (images?.length) return images.slice(0, MAX_POST_MEDIA);
  if (image) return [image];
  return [];
}

/** Images stay image-only. Video never lands in `images[]`. */
export function normalizeCreateMedia(input: {
  media?: IncomingPostMedia[];
  image?: string | null;
  images?: string[];
}): {
  media: NormalizedPostMedia[];
  images: string[];
  image: string | null;
} {
  if (input.media?.length) {
    const media = input.media
      .slice(0, MAX_POST_MEDIA)
      .map((item, index) => ({
        url: item.url,
        type: item.type,
        sortOrder: item.sortOrder ?? index,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item, index) => ({ ...item, sortOrder: index }));
    const images = media.filter((item) => item.type === 'IMAGE').map((item) => item.url);
    return { media, images, image: images[0] ?? null };
  }

  const images = normalizeImages(input.image, input.images);
  const media = images.map((url, sortOrder) => ({
    url,
    type: 'IMAGE' as const,
    sortOrder,
  }));
  return { media, images, image: images[0] ?? null };
}

export function presentPostMedia<
  T extends { image?: string | null; images?: string[] | null },
>(
  post: T,
  mediaRows?: Array<{
    id?: string;
    url: string;
    type: PostMediaKind;
    sortOrder: number;
  } | null>,
): {
  media: Array<{
    id?: string;
    url: string;
    type: PostMediaKind;
    sortOrder: number;
  }>;
  video: string | null;
} {
  const rows = (mediaRows ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row?.url && row.type),
  );
  const media = rows.length
    ? [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
    : normalizeCreateMedia({
        image: post.image,
        images: post.images ?? undefined,
      }).media;
  const video = media.find((item) => item.type === 'VIDEO')?.url ?? null;
  return { media, video };
}
