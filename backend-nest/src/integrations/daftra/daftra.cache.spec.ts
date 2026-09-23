import { daftraReadCacheKey } from './daftra.cache';

describe('daftra.cache', () => {
  it('scopes keys per butcher', () => {
    expect(daftraReadCacheKey('a', 'products')).not.toBe(
      daftraReadCacheKey('b', 'products'),
    );
  });
});
