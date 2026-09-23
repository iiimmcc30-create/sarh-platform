import { normalizeLoginIdentifier } from '@/lib/login-identifier';

describe('normalizeLoginIdentifier', () => {
  it('converts Saudi local mobiles to E.164 like the mobile app', () => {
    expect(normalizeLoginIdentifier('0512345678')).toBe('+966512345678');
    expect(normalizeLoginIdentifier('512345678')).toBe('+966512345678');
    expect(normalizeLoginIdentifier('+966 51 234 5678')).toBe('+966512345678');
    expect(normalizeLoginIdentifier('966512345678')).toBe('+966512345678');
  });

  it('leaves email and username unchanged', () => {
    expect(normalizeLoginIdentifier('butcher@sarh.app')).toBe('butcher@sarh.app');
    expect(normalizeLoginIdentifier('  ShopOwner  ')).toBe('ShopOwner');
  });
});
