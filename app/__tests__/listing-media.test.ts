import { readFileSync } from 'fs';
import path from 'path';
import {
  cloudinaryFitUrl,
  cloudinaryListThumbUrl,
  cloudinaryVideoFirstFrameUrl,
  cloudinaryWidthUrl,
  isEphemeralListingUploadUri,
  isListingVideoStillUri,
  isListingVideoUri,
  listingHasVideo,
  listingPhotoUris,
  listingThumbUri,
  listingVideoUrl,
  postDetailImageUrl,
  postDetailImageWidth,
  postFeedImageUrl,
  postFeedImageWidth,
  POST_FEED_CHROME_PX,
} from '../lib/listingMedia';

const root = path.join(__dirname, '..');

describe('listingMedia', () => {
  it('uses dedicated videoUrl instead of image files', () => {
    const listing = {
      images: ['https://cdn.example/a.jpg'],
      videoUrl: 'https://cdn.example/clip.mp4',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
    };

    expect(listingHasVideo(listing)).toBe(true);
    expect(listingVideoUrl(listing)).toBe('https://cdn.example/clip.mp4');
    expect(listingPhotoUris(listing)).toEqual(['https://cdn.example/a.jpg']);
    expect(listingThumbUri(listing)).toBe('https://cdn.example/a.jpg');
  });

  it('falls back to a video file inside images and thumbnail cover', () => {
    const listing = {
      images: ['https://cdn.example/clip.mov'],
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
    };

    expect(listingHasVideo(listing)).toBe(true);
    expect(listingVideoUrl(listing)).toBe('https://cdn.example/clip.mov');
    expect(listingPhotoUris(listing)).toEqual([]);
    expect(listingThumbUri(listing)).toBe('https://cdn.example/thumb.jpg');
  });

  it('detects Cloudinary video paths without a file extension', () => {
    const listing = {
      images: ['https://res.cloudinary.com/demo/video/upload/v1/safat/listings/clip'],
    };

    expect(listingHasVideo(listing)).toBe(true);
    expect(listingVideoUrl(listing)).toContain('/video/upload/');
    expect(listingPhotoUris(listing)).toEqual([]);
  });

  it('uses Cloudinary first frame when video-only listing has no photos', () => {
    const videoUrl =
      'https://res.cloudinary.com/demo/video/upload/v1/safat/listings/clip.mp4';
    const listing = {
      images: [] as string[],
      videoUrl,
    };

    expect(listingPhotoUris(listing)).toEqual([]);
    expect(listingThumbUri(listing)).toBe(
      'https://res.cloudinary.com/demo/video/upload/w_240,c_fill,so_0,f_jpg,q_auto/v1/safat/listings/clip.jpg',
    );
    expect(cloudinaryVideoFirstFrameUrl(videoUrl)).toContain('so_0,f_jpg');
  });

  it('treats Cloudinary video stills as photos, not playable video', () => {
    const still =
      'https://res.cloudinary.com/demo/video/upload/so_0,f_jpg,q_auto/v1/safat/listings/clip.jpg';
    expect(isListingVideoStillUri(still)).toBe(true);
    expect(isListingVideoUri(still)).toBe(false);
    expect(listingPhotoUris({ images: [still] })).toEqual([still]);
    expect(listingThumbUri({ images: [still], videoUrl: undefined })).toBe(
      'https://res.cloudinary.com/demo/video/upload/w_240,c_fill,so_0,f_jpg,q_auto/v1/safat/listings/clip.jpg',
    );
  });

  it('prefers durable Cloudinary thumb over ephemeral /uploads photo on cards', () => {
    const listing = {
      images: [
        'https://sarh-new4.onrender.com/uploads/listings/dead.jpeg',
      ],
      thumbnailUrl:
        'https://res.cloudinary.com/demo/image/upload/v1/sarh/listings/thumb.jpg',
      videoUrl:
        'https://res.cloudinary.com/demo/video/upload/v1/sarh/listings/clip.mp4',
    };

    expect(isEphemeralListingUploadUri(listing.images[0])).toBe(true);
    expect(listingThumbUri(listing)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_240,c_fill,q_auto,f_auto/v1/sarh/listings/thumb.jpg',
    );
  });

  it('does not expose ephemeral /uploads photos in the gallery', () => {
    expect(
      listingPhotoUris({
        images: ['https://sarh-new4.onrender.com/uploads/listings/dead.jpeg'],
      }),
    ).toEqual([]);
  });

  it('keeps a durable photo as the outer card cover when available', () => {
    const photo =
      'https://res.cloudinary.com/demo/image/upload/v1/sarh/listings/photo.jpg';
    const listing = {
      images: [photo],
      thumbnailUrl:
        'https://res.cloudinary.com/demo/image/upload/v1/sarh/listings/thumb.jpg',
      videoUrl:
        'https://res.cloudinary.com/demo/video/upload/v1/sarh/listings/clip.mp4',
    };

    expect(listingThumbUri(listing)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_240,c_fill,q_auto,f_auto/v1/sarh/listings/photo.jpg',
    );
  });
});

describe('cloudinaryListThumbUrl', () => {
  it('returns undefined for empty values', () => {
    expect(cloudinaryListThumbUrl(undefined)).toBeUndefined();
    expect(cloudinaryListThumbUrl(null)).toBeUndefined();
    expect(cloudinaryListThumbUrl('   ')).toBeUndefined();
  });

  it('leaves non-Cloudinary URLs unchanged', () => {
    expect(cloudinaryListThumbUrl('https://cdn.example/a.jpg')).toBe(
      'https://cdn.example/a.jpg',
    );
  });

  it('inserts list transforms on a bare Cloudinary upload URL', () => {
    expect(
      cloudinaryListThumbUrl(
        'https://res.cloudinary.com/demo/image/upload/v1/safat/listings/abc.jpg',
      ),
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_240,c_fill,q_auto,f_auto/v1/safat/listings/abc.jpg',
    );
  });

  it('does not duplicate existing width/quality/format tokens', () => {
    const already =
      'https://res.cloudinary.com/demo/image/upload/w_240,c_fill,q_auto,f_auto/v1/safat/listings/abc.jpg';
    expect(cloudinaryListThumbUrl(already)).toBe(already);
  });

  it('merges with a video still without repeating f_ or q_', () => {
    expect(
      cloudinaryListThumbUrl(
        'https://res.cloudinary.com/demo/video/upload/so_0,f_jpg,q_auto/v1/safat/listings/clip.jpg',
      ),
    ).toBe(
      'https://res.cloudinary.com/demo/video/upload/w_240,c_fill,so_0,f_jpg,q_auto/v1/safat/listings/clip.jpg',
    );
  });

  it('preserves query strings', () => {
    expect(
      cloudinaryListThumbUrl(
        'https://res.cloudinary.com/demo/image/upload/v1/safat/listings/abc.jpg?_a=1',
      ),
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_240,c_fill,q_auto,f_auto/v1/safat/listings/abc.jpg?_a=1',
    );
  });
});

describe('cloudinaryFitUrl', () => {
  it('sizes row/card/wide independently without stacking widths', () => {
    const bare =
      'https://res.cloudinary.com/demo/image/upload/v1/sarh/butchers/cover.jpg';
    expect(cloudinaryFitUrl(bare, 'row')).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_200,c_fill,q_auto,f_auto/v1/sarh/butchers/cover.jpg',
    );
    expect(cloudinaryFitUrl(bare, 'card')).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_480,c_fill,q_auto,f_auto/v1/sarh/butchers/cover.jpg',
    );
    expect(cloudinaryFitUrl(bare, 'wide')).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_800,c_fill,q_auto,f_auto/v1/sarh/butchers/cover.jpg',
    );
  });

  it('does not add a second w_ token on an already-sized Cloudinary URL', () => {
    const sized =
      'https://res.cloudinary.com/demo/image/upload/w_800,c_fill,q_auto,f_auto/v1/sarh/news/hero.jpg';
    expect(cloudinaryFitUrl(sized, 'row')).toBe(sized);
  });

  it('leaves external hosts unchanged', () => {
    expect(
      cloudinaryFitUrl('https://images.unsplash.com/photo-x?w=800', 'wide'),
    ).toBe('https://images.unsplash.com/photo-x?w=800');
  });
});

describe('post feed Cloudinary delivery', () => {
  const bare =
    'https://res.cloudinary.com/demo/image/upload/v1/sarh/posts/feed.jpg';

  it('requests displayed width × density, not a fixed 1080/1200', () => {
    expect(POST_FEED_CHROME_PX).toBe(76);
    expect(postFeedImageWidth(390, 2)).toBe((390 - 76) * 2);
    expect(postFeedImageWidth(390, 3)).toBe((390 - 76) * 3);
    expect(postFeedImageWidth(430, 3)).toBe((430 - 76) * 3);
    expect(postFeedImageWidth(390, 2)).not.toBe(1080);
    expect(postFeedImageWidth(390, 3)).not.toBe(1200);
  });

  it('inserts w_/c_limit/q_auto/f_auto on Cloudinary post URLs', () => {
    const width = postFeedImageWidth(390, 2);
    expect(postFeedImageUrl(bare, 390, 2)).toBe(
      `https://res.cloudinary.com/demo/image/upload/w_${width},c_limit,q_auto,f_auto/v1/sarh/posts/feed.jpg`,
    );
    expect(cloudinaryWidthUrl(bare, 628)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_628,c_limit,q_auto,f_auto/v1/sarh/posts/feed.jpg',
    );
  });

  it('does not stack a second w_ token on an already-transformed Cloudinary URL', () => {
    const sized =
      'https://res.cloudinary.com/demo/image/upload/w_800,c_fill,q_auto,f_auto/v1/sarh/posts/feed.jpg';
    expect(postFeedImageUrl(sized, 390, 2)).toBe(sized);
    expect(cloudinaryWidthUrl(sized, 628)).toBe(sized);
  });

  it('leaves non-Cloudinary, local, and relative URLs unchanged', () => {
    expect(postFeedImageUrl('https://images.unsplash.com/photo-x?w=800', 390, 2)).toBe(
      'https://images.unsplash.com/photo-x?w=800',
    );
    expect(postFeedImageUrl('file:///data/photo.jpg', 390, 2)).toBe('file:///data/photo.jpg');
    expect(postFeedImageUrl('/uploads/post.jpg', 390, 2)).toBe('/uploads/post.jpg');
    expect(postFeedImageUrl('content://media/1', 390, 2)).toBe('content://media/1');
  });

  it('requests full-bleed detail width × density with c_limit', () => {
    expect(postDetailImageWidth(390, 2)).toBe(780);
    expect(postDetailImageWidth(390, 3)).toBe(1170);
    expect(postDetailImageUrl(bare, 390, 2)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_780,c_limit,q_auto,f_auto/v1/sarh/posts/feed.jpg',
    );
  });
});

describe('listing detail media presentation', () => {
  const detail = readFileSync(path.join(root, 'app/listing/[id].tsx'), 'utf8');
  const player = readFileSync(
    path.join(root, 'components/listing/ListingVideoPlayer.tsx'),
    'utf8',
  );

  it('renders listing images and video at the same full width and a slightly taller media area', () => {
    expect(detail).toContain('screenWidth * 0.72');
    expect(detail).toContain("style={{ width: '100%', height: galleryImageHeight }}");
    expect(detail).toContain('height={galleryImageHeight}');
    expect(detail).toContain('styles.mediaBleed');
    expect(player).toContain("width: '100%'");
    expect(player).toContain('alignSelf: \'stretch\'');
  });

  it('fills the landscape media box without native video chrome', () => {
    expect(player).toContain('contentFit="cover"');
    expect(player).toContain('nativeControls={false}');
    expect(player).toContain('allowsFullscreen={false}');
    expect(player).toContain('controls: false');
    expect(player).toContain("objectFit: 'cover'");
    expect(player).not.toContain('nativeControls={!loadFailed}');
    expect(player).not.toContain('controls: true');
  });
});
