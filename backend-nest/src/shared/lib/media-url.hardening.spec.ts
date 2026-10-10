/**
 * Behaviour tests for client-supplied media URLs (listings, posts, stories,
 * chat, councils): production rejects foreign hosts, localhost, plain http and
 * hosts without a TLD; development keeps local-disk URLs working.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isAcceptableMediaUrl } from './media-url';
import { isOurUploadUrl, isOurUploadUrlStrict } from './storage';
import { classifyMediaUrl, assertUserMediaUrls } from './media-ownership';
import {
  CreateListingDto,
  UpdateListingDto,
} from '../../listings/dto/listings.dto';
import { CreatePostDto, UpdatePostDto } from '../../posts/dto/posts.dto';
import { CreateStoryDto } from '../../stories/dto/stories.dto';
import { CouncilImageDto } from '../../councils/dto/councils.dto';
import { createStreamBodySchema } from '../../livestreams/dto/livestreams.dto';
import { signupAvatar } from '../../auth/services/auth.service';

const CLOUD = 'sarhcloud';
const ME = '11111111-2222-4333-8444-555555555555';
const OURS = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/safat/listings/${ME}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;

const BAD_SHAPES = {
  http: `http://res.cloudinary.com/${CLOUD}/image/upload/v1/safat/listings/x.jpg`,
  localhost: 'https://localhost/uploads/x.jpg',
  localhostPort: 'http://localhost:3000/uploads/x.jpg',
  noTld: 'https://intranet/x.jpg',
  ipv4: 'https://127.0.0.1/x.jpg',
  privateIp: 'https://10.0.0.5/x.jpg',
  ipv6: 'https://[::1]/x.jpg',
  dotLocal: 'https://nas.local/x.jpg',
  credentials: 'https://user:pw@res.cloudinary.com/sarhcloud/x.jpg',
  oddPort: 'https://res.cloudinary.com:8443/sarhcloud/x.jpg',
  javascript: 'javascript:alert(1)',
};

const env = { ...process.env };
function prod() {
  process.env.NODE_ENV = 'production';
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
}
afterEach(() => {
  process.env = { ...env };
});

describe('isAcceptableMediaUrl (DTO shape check)', () => {
  it.each(Object.entries(BAD_SHAPES))('production rejects %s', (_k, url) => {
    expect(isAcceptableMediaUrl(url, true)).toBe(false);
  });

  it('production accepts an https URL on a public host', () => {
    expect(isAcceptableMediaUrl(OURS, true)).toBe(true);
  });

  it('development keeps local-disk uploads working', () => {
    expect(isAcceptableMediaUrl(BAD_SHAPES.localhostPort, false)).toBe(true);
    expect(isAcceptableMediaUrl(BAD_SHAPES.javascript, false)).toBe(false);
  });
});

describe('isOurUploadUrl (production host rule)', () => {
  it('accepts only our Cloudinary cloud over https', () => {
    prod();
    expect(isOurUploadUrl(OURS)).toBe(true);
    expect(
      isOurUploadUrl(`https://${CLOUD}-res.cloudinary.com/image/upload/x.jpg`),
    ).toBe(true);
  });

  it.each([
    ['foreign host', 'https://evil.example/x.jpg'],
    ['other cloud', 'https://res.cloudinary.com/othercloud/image/upload/x.jpg'],
    [
      'cloud-name prefix',
      `https://res.cloudinary.com/${CLOUD}evil/image/upload/x.jpg`,
    ],
    [
      'our cloud as a nested folder',
      `https://res.cloudinary.com/evil/image/upload/${CLOUD}/x.jpg`,
    ],
    ['look-alike host', `https://res.cloudinary.com.evil.net/${CLOUD}/x.jpg`],
    [
      'S3 origin prefix',
      'https://safat-uploads.s3.me-south-1.amazonaws.com.evil.net/x.jpg',
    ],
    ['http', BAD_SHAPES.http],
    ['localhost', BAD_SHAPES.localhost],
    ['no TLD', BAD_SHAPES.noTld],
  ])('rejects %s', (_k, url) => {
    prod();
    expect(isOurUploadUrl(url)).toBe(false);
    expect(isOurUploadUrlStrict(url)).toBe(false);
  });

  it('is permissive only outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(isOurUploadUrl('http://localhost:3000/uploads/x.jpg')).toBe(true);
    // the strict rule never depends on NODE_ENV
    expect(isOurUploadUrlStrict('http://localhost:3000/uploads/x.jpg')).toBe(
      false,
    );
  });
});

describe('server-side ownership check rejects foreign / http media', () => {
  it('classifyMediaUrl: foreign host, localhost, http and no-TLD are foreign_host', () => {
    prod();
    for (const url of [
      'https://evil.example/x.jpg',
      BAD_SHAPES.localhost,
      BAD_SHAPES.http,
      BAD_SHAPES.noTld,
    ]) {
      expect(classifyMediaUrl(url, ME)).toEqual({
        ok: false,
        reason: 'foreign_host',
      });
    }
  });

  it('assertUserMediaUrls throws invalid_media_url for a foreign listing video', async () => {
    prod();
    await expect(
      assertUserMediaUrls(['https://tracker.example/video.mp4'], ME),
    ).rejects.toMatchObject({ status: 400, error: 'invalid_media_url' });
  });
});

async function errorsFor<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body) as object);
  return errors.map((e) => e.property);
}

describe('DTOs reject bad media URLs in production', () => {
  beforeEach(prod);

  const urls = [
    BAD_SHAPES.http,
    BAD_SHAPES.localhost,
    BAD_SHAPES.noTld,
    BAD_SHAPES.ipv4,
  ];

  it.each(urls)(
    'CreateListingDto images/videoUrl/thumbnailUrl: %s',
    async (bad) => {
      const props = await errorsFor(CreateListingDto, {
        images: [bad],
        videoUrl: bad,
        thumbnailUrl: bad,
      });
      expect(props).toEqual(
        expect.arrayContaining(['images', 'videoUrl', 'thumbnailUrl']),
      );
    },
  );

  it.each(urls)('UpdateListingDto images/videoUrl: %s', async (bad) => {
    const props = await errorsFor(UpdateListingDto, {
      images: [bad],
      videoUrl: bad,
    });
    expect(props).toEqual(expect.arrayContaining(['images', 'videoUrl']));
  });

  it.each(urls)('CreatePostDto / UpdatePostDto media: %s', async (bad) => {
    const created = await errorsFor(CreatePostDto, {
      image: bad,
      images: [bad],
    });
    expect(created).toEqual(expect.arrayContaining(['image', 'images']));
    const updated = await errorsFor(UpdatePostDto, {
      image: bad,
      images: [bad],
    });
    expect(updated).toEqual(expect.arrayContaining(['image', 'images']));
  });

  it.each(urls)('CreateStoryDto thumbnail/mediaUrl: %s', async (bad) => {
    const props = await errorsFor(CreateStoryDto, {
      thumbnail: bad,
      mediaUrl: bad,
    });
    expect(props).toEqual(expect.arrayContaining(['thumbnail', 'mediaUrl']));
  });

  it.each(urls)('CouncilImageDto imageUrl: %s', async (bad) => {
    expect(await errorsFor(CouncilImageDto, { imageUrl: bad })).toContain(
      'imageUrl',
    );
  });

  it('accepts our https upload URL', async () => {
    const props = await errorsFor(CreateStoryDto, {
      thumbnail: OURS,
      mediaUrl: OURS,
    });
    expect(props).not.toEqual(
      expect.arrayContaining(['thumbnail', 'mediaUrl']),
    );
  });

  it.each(urls)('live stream thumbnail: %s', (bad) => {
    const parsed = createStreamBodySchema.safeParse({
      title: 'بث تجريبي',
      arabicTitle: 'بث تجريبي',
      category: 'general',
      thumbnail: bad,
    });
    expect(parsed.success).toBe(false);
  });

  it('signup avatar keeps only our upload URL', () => {
    expect(signupAvatar(OURS)).toBe(OURS);
    expect(signupAvatar('https://evil.example/a.jpg')).toBeNull();
    expect(signupAvatar(BAD_SHAPES.localhost)).toBeNull();
    expect(signupAvatar(undefined)).toBeNull();
  });
});
