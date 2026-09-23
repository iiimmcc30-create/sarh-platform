import { mapPostFromApi } from '../services/posts';
import {
  requiresStoryVideoTrim,
  storyClipEndSec,
  storyDurationFromAsset,
  storyDurationForKind,
  storyTrimStartMax,
  validateStoryVideoDuration,
} from '../lib/storyMedia';
import { buildProfileTimeline } from '../lib/profileTimeline';
import type { Listing, Post } from '../services/types';
import {
  FAQ_CATEGORY_LABEL_AR,
  TICKET_STATUS_LABEL_AR,
  VERIFICATION_STATUS_LABEL_AR,
} from '../services/support';

function post(partial: Partial<Post> & { id: string; createdAt: string }): Post {
  const { id, createdAt, ...overrides } = partial;
  return {
    id,
    author: {
      id: 'a1',
      username: 'u',
      displayName: 'U',
      arabicName: 'م',
      verified: false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
    content: 'c',
    arabicContent: 'ع',
    likes: 0,
    reposts: 0,
    comments: 0,
    postedAt: 'اليوم',
    createdAt,
    liked: false,
    reposted: false,
    ...overrides,
  };
}

function listing(id: string, createdAt: string): Listing {
  return {
    id,
    title: 't',
    arabicTitle: 'ع',
    price: 100,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: [],
    description: 'd',
    arabicDescription: 'و',
    seller: {
      id: 's1',
      username: 'u',
      displayName: 'U',
      arabicName: 'م',
      verified: false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
    featured: false,
    pinned: false,
    postedAt: 'اليوم',
    createdAt,
  };
}

describe('posts mapping', () => {
  it('returns null without id/author', () => {
    expect(mapPostFromApi(null)).toBeNull();
    expect(mapPostFromApi({ id: '1' })).toBeNull();
  });

  it('maps API post fields for feed/detail', () => {
    const mapped = mapPostFromApi({
      id: 'p1',
      content: 'hello',
      arabicContent: 'مرحبا',
      image: 'https://cdn/x.jpg',
      likesCount: 3,
      commentsCount: 1,
      repostsCount: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
      liked: true,
      author: {
        id: 'u1',
        username: 'ali',
        displayName: 'Ali',
        arabicName: 'علي',
        verified: true,
        followersCount: 10,
      },
    });
    expect(mapped?.id).toBe('p1');
    expect(mapped?.likes).toBe(3);
    expect(mapped?.liked).toBe(true);
    expect(mapped?.images).toEqual(['https://cdn/x.jpg']);
    expect(mapped?.author.verified).toBe(true);
  });
});

describe('stories media rules', () => {
  it('validates duration bounds and trim needs', () => {
    expect(validateStoryVideoDuration(null)).toBeTruthy();
    expect(validateStoryVideoDuration(1)).toBeTruthy();
    expect(validateStoryVideoDuration(10)).toBeNull();
    expect(requiresStoryVideoTrim(90)).toBe(true);
    expect(requiresStoryVideoTrim(10)).toBe(false);
  });

  it('computes clip windows', () => {
    expect(storyDurationFromAsset(15000)).toBe(15);
    expect(storyClipEndSec(0, 40)).toBeGreaterThan(0);
    expect(storyTrimStartMax(20)).toBeGreaterThanOrEqual(0);
    expect(storyDurationForKind('image', null)).toBeGreaterThan(0);
  });
});

describe('profile timeline + support labels', () => {
  it('merges posts and listings newest first', () => {
    const timeline = buildProfileTimeline(
      [post({ id: 'p1', createdAt: '2026-01-01T00:00:00Z' })],
      [listing('l1', '2026-01-03T00:00:00Z')],
    );
    expect(timeline.map((e) => e.kind)).toEqual(['listing', 'post']);
  });

  it('exposes Arabic labels for support/help screens', () => {
    expect(TICKET_STATUS_LABEL_AR.OPEN).toBeTruthy();
    expect(TICKET_STATUS_LABEL_AR.WAITING_FOR_SUPPORT).toBeTruthy();
    expect(VERIFICATION_STATUS_LABEL_AR.UNDER_REVIEW).toBeTruthy();
    expect(FAQ_CATEGORY_LABEL_AR.GENERAL).toBeTruthy();
  });
});
