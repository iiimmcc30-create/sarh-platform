import { readFileSync } from 'fs';
import path from 'path';
import { getAuthCopy, type AuthCopy } from '../constants/authCopy';

const root = path.join(__dirname, '..');
const login = readFileSync(path.join(root, 'app/auth/phone.tsx'), 'utf8');

/** Every `copy.<key>` the login screen renders. */
function copyKeysUsed(src: string): (keyof AuthCopy)[] {
  const keys = new Set<string>();
  for (const match of src.matchAll(/\bcopy\.([A-Za-z]+)/g)) keys.add(match[1]);
  return [...keys] as (keyof AuthCopy)[];
}

describe('login screen redesign (black & white identity)', () => {
  it('shows the logo only — no Sarh wordmark text on the login screen', () => {
    expect(login).toContain('<AppLogo');
    expect(login).toContain('shape="square"');
    expect(login).not.toContain('brandName');
    expect(login).not.toContain('سرح');
    expect(login).not.toMatch(/['"`>]\s*Sarh\s*['"`<]/);
    const keys = copyKeysUsed(login);
    expect(keys.length).toBeGreaterThan(5);
    for (const locale of ['ar', 'en'] as const) {
      const copy = getAuthCopy(locale);
      for (const key of keys) {
        expect(copy[key]).toBeDefined();
        expect(copy[key]).not.toMatch(/سرح|sarh/i);
      }
    }
  });

  it('uses theme pills: primary CTA + bordered secondary, no gradients or hex', () => {
    expect(login.match(/shape="pill"/g)?.length).toBe(2);
    expect(login).toContain('variant="secondary"');
    expect(login).not.toContain('LinearGradient');
    expect(login).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(login).not.toContain('reanimated');
    expect(login).toContain('Animated.timing(enterAnim');
    expect(login).toContain('isReduceMotionEnabled');
  });

  it('keeps the auth flow untouched', () => {
    expect(login).toContain('signInWithPassword(fullPhone, password)');
    expect(login).toContain("const SAUDI_DIAL = '+966'");
    expect(login).toContain("router.replace('/(tabs)')");
    expect(login).toContain("router.push('/auth/forgot-password')");
    expect(login).toContain("router.push('/auth/register')");
    expect(login).toContain('disabled={!isPhoneValid || password.length < 6}');
  });

  it('links terms and privacy to the guest-reachable info routes', () => {
    expect(login).toContain("router.push('/info/terms')");
    expect(login).toContain("router.push('/info/privacy')");
  });
});
