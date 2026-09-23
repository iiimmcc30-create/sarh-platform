import { normalizeCreateMedia, presentPostMedia } from './post-media';

describe('normalizeCreateMedia', () => {
  it('creates a post with a single image and never stores video in images[]', () => {
    const result = normalizeCreateMedia({
      media: [
        {
          url: 'https://cdn.example/photo.jpg',
          type: 'IMAGE',
        },
      ],
    });
    expect(result.media).toEqual([
      { url: 'https://cdn.example/photo.jpg', type: 'IMAGE', sortOrder: 0 },
    ]);
    expect(result.images).toEqual(['https://cdn.example/photo.jpg']);
    expect(result.image).toBe('https://cdn.example/photo.jpg');
  });

  it('creates a post with a single video without putting it in images[]', () => {
    const result = normalizeCreateMedia({
      media: [
        {
          url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
          type: 'VIDEO',
        },
      ],
    });
    expect(result.media).toEqual([
      {
        url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
        type: 'VIDEO',
        sortOrder: 0,
      },
    ]);
    expect(result.images).toEqual([]);
    expect(result.image).toBeNull();
  });

  it('creates a mixed image + video post and keeps images image-only', () => {
    const result = normalizeCreateMedia({
      media: [
        { url: 'https://cdn.example/a.jpg', type: 'IMAGE', sortOrder: 0 },
        {
          url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
          type: 'VIDEO',
          sortOrder: 1,
        },
      ],
    });
    expect(result.media.map((item) => item.type)).toEqual(['IMAGE', 'VIDEO']);
    expect(result.images).toEqual(['https://cdn.example/a.jpg']);
    expect(result.image).toBe('https://cdn.example/a.jpg');
  });

  it('reorders PostMedia by sortOrder', () => {
    const result = normalizeCreateMedia({
      media: [
        { url: 'https://cdn.example/second.jpg', type: 'IMAGE', sortOrder: 5 },
        { url: 'https://cdn.example/first.mp4', type: 'VIDEO', sortOrder: 1 },
        { url: 'https://cdn.example/third.jpg', type: 'IMAGE', sortOrder: 9 },
      ],
    });
    expect(result.media.map((item) => item.url)).toEqual([
      'https://cdn.example/first.mp4',
      'https://cdn.example/second.jpg',
      'https://cdn.example/third.jpg',
    ]);
    expect(result.media.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it('keeps legacy image-only payloads working for old posts', () => {
    const result = normalizeCreateMedia({
      images: ['https://cdn.example/old-a.jpg', 'https://cdn.example/old-b.jpg'],
    });
    expect(result.media).toEqual([
      { url: 'https://cdn.example/old-a.jpg', type: 'IMAGE', sortOrder: 0 },
      { url: 'https://cdn.example/old-b.jpg', type: 'IMAGE', sortOrder: 1 },
    ]);
    expect(result.images).toEqual([
      'https://cdn.example/old-a.jpg',
      'https://cdn.example/old-b.jpg',
    ]);
  });
});

describe('presentPostMedia', () => {
  it('prefers ordered PostMedia and exposes the first video', () => {
    const presented = presentPostMedia(
      { images: ['https://cdn.example/legacy.jpg'] },
      [
        { id: '2', url: 'https://cdn.example/b.jpg', type: 'IMAGE', sortOrder: 1 },
        {
          id: '1',
          url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
          type: 'VIDEO',
          sortOrder: 0,
        },
      ],
    );
    expect(presented.media.map((item) => item.type)).toEqual(['VIDEO', 'IMAGE']);
    expect(presented.video).toBe(
      'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    );
  });

  it('falls back to legacy images[] when PostMedia is empty', () => {
    const presented = presentPostMedia({
      image: 'https://cdn.example/cover.jpg',
      images: ['https://cdn.example/cover.jpg'],
    });
    expect(presented.media).toEqual([
      { url: 'https://cdn.example/cover.jpg', type: 'IMAGE', sortOrder: 0 },
    ]);
    expect(presented.video).toBeNull();
  });
});
