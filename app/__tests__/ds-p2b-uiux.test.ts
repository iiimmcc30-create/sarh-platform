import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('P2-B UI/UX finalization', () => {
  it('keeps ListingCard, PostItem, and FloatingTabBar visually frozen', () => {
    const card = src('components/feature/ListingCard.tsx');
    const post = src('components/feature/PostItem.tsx');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(card).toContain('export const ListingCard');
    expect(post).toContain("from '@/components/ui/AppText'");
    expect(post).not.toContain("from '@/design-system/components'");
    expect(tabs).toContain("label: 'مجتمع سرح'");
    expect(tabs).not.toContain('SarhButton');
    expect(tabs).not.toContain('SarhBackButton');
  });

  it('auth join profile and compose inputs use writing-direction helpers, not physical textAlign right', () => {
    const files = [
      'app/auth/phone.tsx',
      'app/auth/register.tsx',
      'app/auth/forgot-password.tsx',
      'app/auth/otp.tsx',
      'app/profile/edit/index.tsx',
      'app/create/post.tsx',
      'app/create/story.tsx',
      'app/live/create.tsx',
      'app/chat.tsx',
    ];
    for (const file of files) {
      const text = src(file);
      expect(text).not.toContain('textAlign="right"');
      expect(text).not.toContain('textAlign={isAppRtl()');
    }
    expect(src('app/auth/phone.tsx')).toContain('SarhInput');
    expect(src('app/auth/register.tsx')).toContain('SarhInput');
    // OTP digit boxes are not a SarhInput primitive — they keep ltrInputText locally.
    expect(src('app/auth/otp.tsx')).toContain('ltrInputText');
    expect(src('app/auth/forgot-password.tsx')).toContain('ltrInputText');
    // Auth/join labeled fields now compose SarhInput, which applies
    // rtlInputText/ltrInputText internally, so the guarantee moved to the primitive.
    expect(src('app/profile/edit/index.tsx')).toContain('width="form"');
    expect(src('components/feature/ProfileFieldEditScreen.tsx')).toContain('SarhInput');
    expect(src('design-system/components/SarhInput.tsx')).toContain('rtlInputText');
    expect(src('design-system/components/SarhInput.tsx')).toContain('ltrInputText');
  });

  it('constrains auth and join forms on tablet without full-bleed stretch', () => {
    expect(src('app/auth/phone.tsx')).toContain('maxWidth: 440');
    expect(src('app/auth/register.tsx')).toContain('maxWidth: 440');
    expect(src('app/auth/forgot-password.tsx')).toContain('maxWidth: 440');
    expect(src('app/auth/otp.tsx')).toContain('maxWidth: 440');
    // Profile edit takes the same 560 cap from the responsive layer instead of
    // hard-coding it — CONTENT_MAX_WIDTH.form is asserted in useLayout's tests.
    expect(src('app/profile/edit/index.tsx')).toContain('width="form"');
  });

  it('adds password a11y on auth', () => {
    expect(src('app/auth/phone.tsx')).toContain('إظهار كلمة المرور');
    expect(src('app/auth/register.tsx')).toContain('accessibilityRole="checkbox"');
  });
});
