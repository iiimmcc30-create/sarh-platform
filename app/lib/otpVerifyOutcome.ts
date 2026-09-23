export type OtpVerifyClientResult = {
  success: boolean;
  isNew?: boolean;
  phoneToken?: string;
  error?: string;
};

export type OtpVerifyFlow =
  | { kind: 'invalid'; error: string }
  | { kind: 'existing_login' }
  | { kind: 'registration_continuation'; phoneToken: string }
  | { kind: 'missing_phone_token'; error: string };

export function interpretOtpVerifyResult(
  result: OtpVerifyClientResult,
): OtpVerifyFlow {
  if (!result.success) {
    return { kind: 'invalid', error: result.error ?? 'الرمز غير صحيح' };
  }

  if (result.isNew) {
    if (!result.phoneToken) {
      return {
        kind: 'missing_phone_token',
        error: result.error ?? 'تعذر إكمال التسجيل، حاول مرة أخرى',
      };
    }
    return {
      kind: 'registration_continuation',
      phoneToken: result.phoneToken,
    };
  }

  return { kind: 'existing_login' };
}
