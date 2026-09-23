import {
  extractListingVideoUrl,
  isEphemeralDiskUploadUrl,
  sanitizeListingMedia,
} from './media-url';

describe('listing media sanitization', () => {
  it('detects ephemeral Render /uploads URLs', () => {
    expect(
      isEphemeralDiskUploadUrl(
        'https://sarh-new4.onrender.com/uploads/listings/dead.jpeg',
      ),
    ).toBe(true);
    expect(
      isEphemeralDiskUploadUrl(
        'https://res.cloudinary.com/demo/image/upload/v1/x.jpg',
      ),
    ).toBe(false);
  });

  it('drops /uploads images and prefers a durable thumbnail', () => {
    const sanitized = sanitizeListingMedia({
      images: ['https://sarh-new4.onrender.com/uploads/listings/dead.jpeg'],
      thumbnailUrl:
        'https://res.cloudinary.com/demo/image/upload/v1/sarh/listings/thumb.jpg',
      videoUrl: null,
    });
    expect(sanitized.images).toEqual([
      'https://res.cloudinary.com/demo/image/upload/v1/sarh/listings/thumb.jpg',
    ]);
    expect(sanitized.thumbnailUrl).toContain('res.cloudinary.com');
  });

  it('returns empty images when only ephemeral media exists', () => {
    const sanitized = sanitizeListingMedia({
      images: ['https://sarh-new4.onrender.com/uploads/listings/dead.jpeg'],
      thumbnailUrl: 'https://sarh-new4.onrender.com/uploads/listings/t.jpeg',
      videoUrl: null,
    });
    expect(sanitized.images).toEqual([]);
    expect(sanitized.thumbnailUrl).toBeNull();
  });

  it('still extracts a Cloudinary video URL', () => {
    expect(
      extractListingVideoUrl(null, [
        'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
      ]),
    ).toContain('/video/upload/');
  });
});
