/**
 * Frontend signup gate contracts — ensures register never silently converts
 * OTP verify of an existing phone into a login session.
 */
import { interpretOtpVerifyResult } from '@/lib/otpVerifyOutcome';
import { getAuthCopy } from '@/constants/authCopy';
import * as fs from 'fs';
import * as path from 'path';

describe('signup uniqueness UX contracts', () => {
  const copy = getAuthCopy('ar');

  it('uses the exact Arabic phone-taken copy', () => {
    expect(copy.errPhoneTaken).toBe('هذا الرقم مسجل مسبقًا');
  });

  it('uses the exact Arabic username-taken copy', () => {
    expect(copy.errUsernameTaken).toBe('هذا الاسم مستخدم بالفعل');
  });

  it('interpretOtpVerifyResult treats failed OTP as invalid (not login)', () => {
    expect(
      interpretOtpVerifyResult({
        success: false,
        error: 'هذا الرقم مسجل مسبقًا',
      }),
    ).toEqual({ kind: 'invalid', error: 'هذا الرقم مسجل مسبقًا' });
  });

  it('existing_login is distinct from registration_continuation', () => {
    expect(interpretOtpVerifyResult({ success: true, isNew: false }).kind).toBe(
      'existing_login',
    );
    expect(
      interpretOtpVerifyResult({
        success: true,
        isNew: true,
        phoneToken: 'tok',
      }).kind,
    ).toBe('registration_continuation');
  });

  it('register screen uses signup purpose and checkSignup', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/auth/register.tsx'),
      'utf8',
    );
    expect(src).toContain("verifyOtp(fullPhone, otpCode, 'signup')");
    expect(src).toContain("sendOtp(fullPhone, 'sms', 'signup')");
    expect(src).toContain('checkSignup');
    expect(src).toContain('errPhoneTaken');
    expect(src).toContain('errUsernameTaken');
    expect(src).toContain('errorText={phoneError');
    expect(src).toContain('errorText={usernameError');
    // Must not silently accept existing_login during signup
    expect(src).toContain("otpFlow.kind === 'existing_login'");
    expect(src).toContain('goTo(\'phone\')');
  });

  it('AuthContext never saves session for signup purpose', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../contexts/AuthContext.tsx'),
      'utf8',
    );
    expect(src).toContain("purpose === 'signup'");
    expect(src).toContain('checkSignup');
    // Session save only after the signup/join/reset early-return branch
    const verifyFn = src.slice(src.indexOf('const verifyOtp = useCallback'));
    const signupBranch = verifyFn.slice(
      0,
      verifyFn.indexOf('// مستخدم موجود — احفظ الجلسة'),
    );
    expect(signupBranch).toContain("purpose === 'signup'");
    expect(signupBranch).not.toContain('saveSession(');
  });
});
