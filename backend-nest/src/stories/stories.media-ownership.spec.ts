import { StoriesService } from './stories.service';
import { assertUserMediaUrls } from '../shared/lib/media-ownership';

jest.mock('../shared/lib/media-ownership', () => ({
  assertUserMediaUrls: jest.fn().mockResolvedValue(undefined),
}));

const assertMedia = assertUserMediaUrls as jest.Mock;

describe('StoriesService.createStory media check', () => {
  const repo = {
    findListingOwnedByUser: jest.fn(),
    createStory: jest.fn(),
  };
  const service = new StoriesService(
    repo as never,
    {} as never,
    {} as never,
    { del: jest.fn(), delPattern: jest.fn() } as never,
    {} as never,
    {} as never,
    { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects before saving when a media URL is not the user’s upload', async () => {
    assertMedia.mockRejectedValueOnce(
      Object.assign(new Error('invalid_media_url'), { status: 400 }),
    );
    await expect(
      service.createStory(
        { userId: 'u1' } as never,
        {
          thumbnail: 'https://evil.example/x.jpg',
        } as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(assertMedia).toHaveBeenCalledWith(
      ['https://evil.example/x.jpg', undefined],
      'u1',
      { existing: [] },
    );
    expect(repo.createStory).not.toHaveBeenCalled();
  });

  it('lets a story about my own listing reuse that listing’s photos', async () => {
    repo.findListingOwnedByUser.mockResolvedValue({
      id: 'l1',
      images: ['https://cdn/l1-a.jpg'],
      thumbnailUrl: null,
      videoUrl: null,
    });
    repo.createStory.mockRejectedValue(new Error('stop-after-check'));
    await service
      .createStory(
        { userId: 'u1' } as never,
        {
          thumbnail: 'https://cdn/l1-a.jpg',
          listingId: 'l1',
        } as never,
      )
      .catch(() => undefined);
    expect(assertMedia).toHaveBeenCalledWith(
      ['https://cdn/l1-a.jpg', undefined],
      'u1',
      { existing: ['https://cdn/l1-a.jpg', null, null] },
    );
  });
});
