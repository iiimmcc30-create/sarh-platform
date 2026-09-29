import {
  canonicalCloudinaryUrl,
  isOwnProtectedUpload,
  mediaTooLargeMessage,
  messageMediaMaxMb,
  parseCloudinaryUrl,
  publicMediaForPush,
} from './message-media';

describe('message-media helpers', () => {
  it('parses a signed authenticated voice URL and strips the signature', () => {
    const ref = parseCloudinaryUrl(
      'https://res.cloudinary.com/sarh/video/authenticated/s--AbC123_x--/v1727600000/safat/messages/u1/abc.m4a',
    );
    expect(ref).toEqual({
      cloudName: 'sarh',
      resourceType: 'video',
      deliveryType: 'authenticated',
      version: '1727600000',
      publicId: 'safat/messages/u1/abc',
      format: 'm4a',
    });
    expect(canonicalCloudinaryUrl(ref!)).toBe(
      'https://res.cloudinary.com/sarh/video/authenticated/v1727600000/safat/messages/u1/abc.m4a',
    );
  });

  it('parses legacy public upload URLs and rejects non-Cloudinary URLs', () => {
    expect(
      parseCloudinaryUrl(
        'https://res.cloudinary.com/sarh/image/upload/v1/safat/messages/x.jpg',
      ),
    ).toMatchObject({ deliveryType: 'upload', publicId: 'safat/messages/x' });
    expect(parseCloudinaryUrl('https://evil.example.com/a.jpg')).toBeNull();
    expect(parseCloudinaryUrl('not a url')).toBeNull();
  });

  it('checks upload ownership by folder', () => {
    expect(isOwnProtectedUpload('safat/messages/u1/a', 'safat', 'u1')).toBe(
      true,
    );
    expect(isOwnProtectedUpload('safat/messages/u2/a', 'safat', 'u1')).toBe(
      false,
    );
  });

  it('uses 20/50/10 MB limits with Arabic messages', () => {
    expect(messageMediaMaxMb('IMAGE')).toBe(20);
    expect(messageMediaMaxMb('VIDEO')).toBe(50);
    expect(messageMediaMaxMb('VOICE')).toBe(10);
    expect(mediaTooLargeMessage('VOICE')).toContain('10 ميجابايت');
  });

  it('never copies protected media into push payloads', () => {
    expect(
      publicMediaForPush({
        imageUrl:
          'https://res.cloudinary.com/sarh/image/authenticated/v1/safat/messages/u1/a.jpg',
      }),
    ).toEqual({});
    expect(
      publicMediaForPush({
        imageUrl:
          'https://res.cloudinary.com/sarh/image/upload/v1/safat/messages/a.jpg',
      }),
    ).toEqual({
      imageUrl:
        'https://res.cloudinary.com/sarh/image/upload/v1/safat/messages/a.jpg',
    });
  });
});
