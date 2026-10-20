import {
  compressBody,
  isCompressibleType,
  negotiateEncoding,
  shouldCompressBody,
} from './response-compression';
import { gunzipSync, brotliDecompressSync } from 'zlib';

describe('response compression', () => {
  it('prefers brotli, then gzip', () => {
    expect(negotiateEncoding('gzip, deflate, br')).toBe('br');
    expect(negotiateEncoding('gzip')).toBe('gzip');
    expect(negotiateEncoding(undefined)).toBeNull();
  });

  it('compresses json and text above 1kb and skips images', () => {
    expect(isCompressibleType('application/json; charset=utf-8')).toBe(true);
    expect(isCompressibleType('image/jpeg')).toBe(false);
    expect(shouldCompressBody('application/json', 100)).toBe(false);
    expect(shouldCompressBody('application/json', 2048)).toBe(true);
    expect(shouldCompressBody('image/png', 2048)).toBe(false);
  });

  it('round-trips gzip and brotli', () => {
    const body = Buffer.from('{"ok":true}'.repeat(200));
    expect(gunzipSync(compressBody(body, 'gzip'))).toEqual(body);
    expect(brotliDecompressSync(compressBody(body, 'br'))).toEqual(body);
  });
});
