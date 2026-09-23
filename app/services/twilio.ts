// Powered by OnSpace.AI
// SAFAT — Twilio OTP Authentication Service
// مزود خدمة المصادقة عبر رقم الجوال

const TWILIO_BASE = 'https://api.twilio.com/v1';
const TWILIO_API_KEY = process.env.EXPO_PUBLIC_TWILIO_API_KEY ?? '';

export interface TwilioSendOtpRequest {
  phone: string;      // E.164 format: +966501234567
  channel?: 'sms' | 'whatsapp';
  locale?: 'ar' | 'en';
}

export interface TwilioSendOtpResponse {
  success: boolean;
  requestId?: string;   // Used to verify the OTP later
  expiresIn?: number;   // seconds
  error?: string;
  errorAr?: string;
}

export interface TwilioVerifyRequest {
  requestId: string;
  phone: string;
  code: string;
}

export interface TwilioVerifyResponse {
  success: boolean;
  verified: boolean;
  token?: string;       // Short-lived token to pass to your backend
  error?: string;
  errorAr?: string;
}

// ── Send OTP ─────────────────────────────────────────────────────────────────
export async function sendOtp(
  phone: string,
  channel: 'sms' | 'whatsapp' = 'sms'
): Promise<TwilioSendOtpResponse> {
  try {
    const res = await fetch(`${TWILIO_BASE}/otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': TWILIO_API_KEY,
      },
      body: JSON.stringify({
        phone,
        channel,
        locale: 'ar',
        app_name: 'سرح',
        message_template: 'رمز التحقق في تطبيق سرح: {{code}}',
      } satisfies TwilioSendOtpRequest & { app_name: string; message_template: string }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err.error ?? 'send_failed',
        errorAr: err.message_ar ?? 'فشل إرسال رمز التحقق. حاول مجدداً.',
      };
    }

    const data = await res.json();
    return {
      success: true,
      requestId: data.request_id,
      expiresIn: data.expires_in ?? 120,
    };
  } catch {
    return {
      success: false,
      error: 'network_error',
      errorAr: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.',
    };
  }
}

// ── Verify OTP ────────────────────────────────────────────────────────────────
export async function verifyOtp(
  requestId: string,
  phone: string,
  code: string
): Promise<TwilioVerifyResponse> {
  try {
    const res = await fetch(`${TWILIO_BASE}/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': TWILIO_API_KEY,
      },
      body: JSON.stringify({ request_id: requestId, phone, code } satisfies {
        request_id: string; phone: string; code: string;
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.verified) {
      return {
        success: false,
        verified: false,
        error: data.error ?? 'invalid_code',
        errorAr: data.message_ar ?? 'الرمز غير صحيح أو منتهي الصلاحية.',
      };
    }

    return {
      success: true,
      verified: true,
      token: data.token,
    };
  } catch {
    return {
      success: false,
      verified: false,
      error: 'network_error',
      errorAr: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.',
    };
  }
}

// ── Phone number formatter ────────────────────────────────────────────────────
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('0')) return `+966${digits.slice(1)}`;
  if (digits.length === 9) return `+966${digits}`;
  return `+${digits}`;
}

export function isValidSaudiPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+9665[0-9]{8}$/.test(normalized);
}

export function formatDisplayPhone(phone: string): string {
  const n = normalizePhone(phone);
  // +9665XXXXXXXX → +966 5XX XXX XXX
  return n.replace(/^\+966(\d)(\d{3})(\d{3})(\d{3})$/, '+966 $1$2 $3 $4');
}
