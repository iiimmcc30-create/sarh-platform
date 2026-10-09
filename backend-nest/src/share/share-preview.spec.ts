import { SharePreviewController } from './share-preview.controller';
import {
  escapeHtml,
  formatPriceAr,
  previewImageUrl,
  renderSharePreview,
  SHARE_DEFAULT_IMAGE,
} from './share-preview.html';

function fakeRes() {
  const res: Record<string, jest.Mock> & { body?: string; code?: number } =
    {} as never;
  res.status = jest.fn((c: number) => {
    res.code = c;
    return res;
  });
  res.setHeader = jest.fn(() => res);
  res.send = jest.fn((b: string) => {
    res.body = b;
    return res;
  });
  return res;
}

describe('share preview html', () => {
  it('escapes and builds OG tags with a 1200px Cloudinary jpg', () => {
    const html = renderSharePreview({
      url: 'https://sarhsa.online/l/x',
      title: 'نعيمي <b>"حري"</b>',
      description: 'وصف',
      image: 'https://res.cloudinary.com/demo/image/upload/v1/a.png',
    });
    expect(html).toContain(
      '<meta property="og:title" content="نعيمي &lt;b&gt;&quot;حري&quot;&lt;/b&gt;" />',
    );
    expect(html).toContain(
      'https://res.cloudinary.com/demo/image/upload/w_1200,c_limit,q_auto,f_jpg/v1/a.png',
    );
    expect(html).toContain('twitter:card');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('image + price fallbacks', () => {
    expect(previewImageUrl(null)).toBe(SHARE_DEFAULT_IMAGE);
    expect(previewImageUrl('/uploads/a.jpg')).toBe(
      'https://sarhsa.online/uploads/a.jpg',
    );
    expect(
      previewImageUrl('https://res.cloudinary.com/d/video/upload/v1/a.mp4'),
    ).toBe(SHARE_DEFAULT_IMAGE);
    expect(formatPriceAr(2500, 'SAR')).toBe('2,500 ريال');
    expect(formatPriceAr(0, 'SAR')).toBeNull();
  });
});

describe('SharePreviewController', () => {
  const prisma = {
    listing: { findFirst: jest.fn() },
    post: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const ctrl = new SharePreviewController(prisma as never);

  it('listing card: title — price, first image', async () => {
    prisma.listing.findFirst.mockResolvedValueOnce({
      title: 't',
      arabicTitle: 'نعيمي للبيع',
      description: 'حري',
      price: 3000,
      currency: 'SAR',
      location: 'الرياض',
      images: ['https://res.cloudinary.com/d/image/upload/v1/x.jpg'],
    });
    const res = fakeRes();
    await ctrl.listing('abc', res as never);
    expect(res.code).toBe(200);
    expect(res.body).toContain('content="نعيمي للبيع — 3,000 ريال"');
    expect(res.body).toContain('w_1200');
    expect(prisma.listing.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'abc',
      deletedAt: null,
    });
  });

  it('unknown / invalid ids get a generic 404 card without hitting the DB', async () => {
    const res = fakeRes();
    await ctrl.post('../../etc', res as never);
    expect(res.code).toBe(404);
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
    expect(res.body).toContain('og:title');
  });

  it('profile card from the public handle', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      arabicName: 'متعب',
      displayName: 'Mutab',
      username: 'mutab',
      bio: 'مربي إبل',
      avatar: null,
    });
    const res = fakeRes();
    await ctrl.profile('mutab', res as never);
    expect(res.body).toContain('متعب (@mutab) على سرح');
  });
});
