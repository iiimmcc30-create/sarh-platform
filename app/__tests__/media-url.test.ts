import { resolveMediaUrl } from '../services/media';

jest.mock('../services/api', () => ({
  API_BASE: 'https://sarh-new4.onrender.com',
}));

describe('resolveMediaUrl', () => {
  it('keeps Cloudinary URLs intact', () => {
    const url =
      'https://res.cloudinary.com/dh5jy1xmn/image/upload/v1/safat/listings/abc.jpg';
    expect(resolveMediaUrl(url)).toBe(url);
  });

  it('prefixes relative upload paths with API_BASE', () => {
    expect(resolveMediaUrl('/uploads/listings/a.jpeg')).toBe(
      'https://sarh-new4.onrender.com/uploads/listings/a.jpeg',
    );
  });

  it('rewrites private LAN hosts to API_BASE so devices can reach media', () => {
    expect(resolveMediaUrl('http://192.168.100.9:3001/uploads/listings/a.jpeg')).toBe(
      'https://sarh-new4.onrender.com/uploads/listings/a.jpeg',
    );
  });

  it('rewrites loopback hosts to API_BASE', () => {
    expect(resolveMediaUrl('http://127.0.0.1:3001/uploads/listings/a.jpeg')).toBe(
      'https://sarh-new4.onrender.com/uploads/listings/a.jpeg',
    );
  });
});
