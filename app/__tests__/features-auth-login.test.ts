import { normalizePhone, isValidSaudiPhone, formatDisplayPhone } from '../services/twilio';
import {
  extractOAuthParams,
  getIdTokenFromCallbackUrl,
} from '../lib/googleOAuthCallback';
import { postDetailHref } from '../lib/openPost';
import { requireAuth } from '../lib/postInteractions';

describe('auth / login helpers', () => {
  it('normalizes Saudi phone variants to E.164', () => {
    expect(normalizePhone('0512345678')).toBe('+966512345678');
    expect(normalizePhone('512345678')).toBe('+966512345678');
    expect(normalizePhone('966512345678')).toBe('+966512345678');
    expect(normalizePhone('+966 51 234 5678')).toBe('+966512345678');
  });

  it('validates Saudi mobile numbers only', () => {
    expect(isValidSaudiPhone('0512345678')).toBe(true);
    expect(isValidSaudiPhone('0112345678')).toBe(false);
    expect(isValidSaudiPhone('123')).toBe(false);
  });

  it('formats display phone (returns normalized E.164 when pattern fits)', () => {
    const formatted = formatDisplayPhone('0512345678');
    expect(formatted.startsWith('+966')).toBe(true);
    expect(formatted.replace(/\D/g, '')).toBe('966512345678');
  });

  it('extracts OAuth id_token from callback URLs', () => {
    const url =
      'exp://127.0.0.1:8081/--/expo-auth-session#id_token=abc.def&state=1';
    expect(extractOAuthParams(url).id_token).toBe('abc.def');
    expect(getIdTokenFromCallbackUrl(url)).toBe('abc.def');
    expect(getIdTokenFromCallbackUrl(null)).toBeNull();
  });
});

describe('posts navigation & auth gate', () => {
  it('builds post detail href with optional comment focus', () => {
    expect(postDetailHref('p1')).toBe('/post/p1');
    expect(postDetailHref('p1', true)).toContain('p1');
  });

  it('requireAuth blocks guests', () => {
    expect(requireAuth(false, 'like')).toBe(false);
    expect(requireAuth(true, 'like')).toBe(true);
  });
});
