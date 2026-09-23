const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const ALLOWED_TEMPLATES = new Set([
  'welcome',
  'fee_reminder',
  'order_update',
  'subscription_renew',
  'email_verification',
  'butcher_daftra_ready',
]);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\0]/g, '').trim();
}

export function isSafeEmailAddress(value: string): boolean {
  const email = sanitizeHeaderValue(value);
  return email.length > 2 && email.length <= 254 && EMAIL_RE.test(email);
}

export function isAllowedEmailTemplate(template: string): boolean {
  return ALLOWED_TEMPLATES.has(template);
}

export function sanitizeEmailVariable(value: unknown): string {
  if (typeof value !== 'string') return '';
  return escapeHtml(sanitizeHeaderValue(value));
}

export function sanitizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = sanitizeHeaderValue(value);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return escapeHtml(url.toString());
  } catch {
    return '';
  }
}

export function sanitizeMultilineHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return escapeHtml(value.replace(/\r/g, '')).replace(/\n/g, '<br/>');
}
