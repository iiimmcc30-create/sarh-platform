import type { AppLocale } from '@/lib/locale';

type AuthCopy = {
  welcomeTitle: string;
  welcomeSubtitle: string;
  startCta: string;
  haveAccount: string;
  loginTitle: string;
  phoneLabel: string;
  phonePlaceholder: string;
  passwordLabel: string;
  loginCta: string;
  forgotPassword: string;
  createAccountLink: string;
  back: string;
  continueCta: string;
  stepPhoneTitle: string;
  stepNameTitle: string;
  stepUsernameTitle: string;
  stepDobTitle: string;
  stepPasswordTitle: string;
  stepConfirmPasswordTitle: string;
  registerCta: string;
  namePlaceholder: string;
  usernamePlaceholder: string;
  dobPlaceholder: string;
  passwordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  otpTitle: string;
  otpSubtitle: string;
  otpConfirm: string;
  otpEdit: string;
  termsAgree: string;
  usernameHint: string;
  usernameFormatOk: string;
  usernameFormatBad: string;
  errPhone: string;
  errPhoneTaken: string;
  errName: string;
  errUsername: string;
  errUsernameTaken: string;
  errDob: string;
  errPassword: string;
  errPasswordMatch: string;
  errTerms: string;
  errOtp: string;
  errGeneric: string;
  brandName: string;
};

const ar: AuthCopy = {
  welcomeTitle: 'مرحباً بك في سرح',
  welcomeSubtitle: 'منصة المواشي والخدمات البيطرية في المملكة',
  startCta: 'ابدأ الآن',
  haveAccount: 'لدي حساب بالفعل',
  loginTitle: 'تسجيل الدخول',
  phoneLabel: 'رقم الجوال',
  phonePlaceholder: '05xxxxxxxx',
  passwordLabel: 'كلمة المرور',
  loginCta: 'تسجيل الدخول',
  forgotPassword: 'نسيت كلمة المرور؟',
  createAccountLink: 'إنشاء حساب جديد',
  back: 'رجوع',
  continueCta: 'متابعة',
  stepPhoneTitle: 'أدخل رقم الجوال',
  stepNameTitle: 'أدخل اسمك الكامل',
  stepUsernameTitle: 'اختر اسم المستخدم',
  stepDobTitle: 'تاريخ الميلاد',
  stepPasswordTitle: 'أنشئ كلمة المرور',
  stepConfirmPasswordTitle: 'تأكيد كلمة المرور',
  registerCta: 'تسجيل',
  namePlaceholder: 'الاسم الكامل',
  usernamePlaceholder: 'username',
  dobPlaceholder: 'YYYY-MM-DD',
  passwordPlaceholder: 'كلمة المرور',
  confirmPasswordPlaceholder: 'أعد كتابة كلمة المرور',
  otpTitle: 'رمز التحقق',
  otpSubtitle: 'أدخل الرمز المرسل إلى جوالك',
  otpConfirm: 'تأكيد الرمز وإنشاء الحساب',
  otpEdit: 'تعديل البيانات',
  termsAgree: 'أوافق على شروط الاستخدام',
  usernameHint: '3–20 حرفًا إنجليزيًا صغيرًا أو أرقام أو _',
  usernameFormatOk: 'الصيغة صحيحة',
  usernameFormatBad: '3-20 حرف: أرقام، حروف إنجليزية صغيرة، أو _',
  errPhone: 'أدخل رقم جوال سعودي صحيح',
  errPhoneTaken: 'هذا الرقم مسجل مسبقًا',
  errName: 'أدخل اسمًا كاملًا (حرفان على الأقل)',
  errUsername: 'اختر اسم مستخدم صالحًا',
  errUsernameTaken: 'هذا الاسم مستخدم بالفعل',
  errDob: 'استخدم الصيغة YYYY-MM-DD',
  errPassword: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
  errPasswordMatch: 'كلمتا المرور غير متطابقتين',
  errTerms: 'يجب الموافقة على الشروط',
  errOtp: 'أدخل رمز التحقق المكون من 6 أرقام',
  errGeneric: 'تعذّر إكمال العملية',
  brandName: 'سرح',
};

const en: AuthCopy = {
  welcomeTitle: 'Welcome to Sarh',
  welcomeSubtitle: 'Saudi livestock marketplace & services',
  startCta: 'Get started',
  haveAccount: 'I already have an account',
  loginTitle: 'Sign in',
  phoneLabel: 'Mobile number',
  phonePlaceholder: '05xxxxxxxx',
  passwordLabel: 'Password',
  loginCta: 'Sign in',
  forgotPassword: 'Forgot password?',
  createAccountLink: 'Create an account',
  back: 'Back',
  continueCta: 'Continue',
  stepPhoneTitle: 'Enter your mobile number',
  stepNameTitle: 'Enter your full name',
  stepUsernameTitle: 'Choose a username',
  stepDobTitle: 'Date of birth',
  stepPasswordTitle: 'Create a password',
  stepConfirmPasswordTitle: 'Confirm password',
  registerCta: 'Sign up',
  namePlaceholder: 'Full name',
  usernamePlaceholder: 'username',
  dobPlaceholder: 'YYYY-MM-DD',
  passwordPlaceholder: 'Password',
  confirmPasswordPlaceholder: 'Re-enter password',
  otpTitle: 'Verification code',
  otpSubtitle: 'Enter the code sent to your phone',
  otpConfirm: 'Verify & create account',
  otpEdit: 'Edit details',
  termsAgree: 'I agree to the Terms of Use',
  usernameHint: '3–20 lowercase letters, numbers, or _',
  usernameFormatOk: 'Looks valid',
  usernameFormatBad: '3–20 chars: a–z, 0–9, or _',
  errPhone: 'Enter a valid Saudi mobile number',
  errPhoneTaken: 'This number is already registered',
  errName: 'Enter your full name (at least 2 characters)',
  errUsername: 'Choose a valid username',
  errUsernameTaken: 'This username is already taken',
  errDob: 'Use YYYY-MM-DD format',
  errPassword: 'Password must be at least 6 characters',
  errPasswordMatch: 'Passwords do not match',
  errTerms: 'Please accept the terms',
  errOtp: 'Enter the 6-digit code',
  errGeneric: 'Something went wrong',
  brandName: 'Sarh',
};

export function getAuthCopy(locale: AppLocale): AuthCopy {
  return locale === 'en' ? en : ar;
}

export type { AuthCopy };
