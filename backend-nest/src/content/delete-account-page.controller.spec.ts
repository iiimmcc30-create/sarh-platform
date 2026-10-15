import { normalizeSaudiMobile } from './delete-account-page.controller';

describe('normalizeSaudiMobile', () => {
  it('accepts local and international Saudi mobiles', () => {
    expect(normalizeSaudiMobile('0551234567')).toBe('+966551234567');
    expect(normalizeSaudiMobile('551234567')).toBe('+966551234567');
    expect(normalizeSaudiMobile('+966551234567')).toBe('+966551234567');
    expect(normalizeSaudiMobile('966 55 123 4567')).toBe('+966551234567');
  });

  it('rejects short or non-mobile numbers', () => {
    expect(normalizeSaudiMobile('0112345678')).toBeNull();
    expect(normalizeSaudiMobile('055123')).toBeNull();
    expect(normalizeSaudiMobile('')).toBeNull();
  });
});
