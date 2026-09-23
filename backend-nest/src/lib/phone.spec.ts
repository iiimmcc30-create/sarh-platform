import {
  isValidSaudiMobileE164,
  normalizeE164Phone,
  SAUDI_MOBILE_E164,
} from './phone';

describe('phone helpers', () => {
  it('normalizes 05xxxxxxxx to +9665xxxxxxxx', () => {
    expect(normalizeE164Phone('0512345678')).toBe('+966512345678');
  });

  it('accepts valid Saudi E.164', () => {
    expect(SAUDI_MOBILE_E164.test('+966512345678')).toBe(true);
    expect(isValidSaudiMobileE164('+966512345678')).toBe(true);
  });

  it('rejects invalid test numbers used in smoke tests', () => {
    expect(isValidSaudiMobileE164('+9665518347524')).toBe(false);
  });
});
