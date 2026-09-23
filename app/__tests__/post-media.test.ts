import { collectListingMedia, collectPostMedia, isFeedVideoUri } from '@/lib/postMedia';
import { postShareUrl } from '@/lib/postInteractions';

describe('post media collection', () => {
  it('keeps mixed image and video order for the viewer', () => {
    const items = collectPostMedia(
      [
        'https://cdn.example/a.jpg',
        'https://cdn.example/b.png',
        'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
        'https://cdn.example/c.webp',
      ],
      null,
    );
    expect(items.map((item) => item.kind)).toEqual(['image', 'image', 'video', 'image']);
    expect(items[2].posterUri).toContain('so_0');
  });

  it('includes a dedicated video field once', () => {
    const items = collectPostMedia(
      ['https://cdn.example/a.jpg', 'https://cdn.example/clip.mp4'],
      'https://cdn.example/clip.mp4',
    );
    expect(items.filter((item) => item.kind === 'video')).toHaveLength(1);
  });

  it('detects listing videos without changing card media order', () => {
    expect(isFeedVideoUri('https://cdn.example/file.webm')).toBe(true);
    const items = collectListingMedia({
      images: ['https://cdn.example/cover.jpg'],
      videoUrl: 'https://cdn.example/clip.mp4',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
    });
    expect(items[0].kind).toBe('image');
    expect(items[1]).toMatchObject({
      kind: 'video',
      uri: 'https://cdn.example/clip.mp4',
      posterUri: 'https://cdn.example/thumb.jpg',
    });
  });
});

describe('post share url', () => {
  it('shares the real public post path', () => {
    expect(postShareUrl('abc-1')).toBe('https://sarhsa.online/post/abc-1');
  });
});
