/** Saudi mobile in strict E.164: +9665xxxxxxxx (8 digits after the leading 5). */
export const SAUDI_MOBILE_E164 = /^\+9665\d{8}$/;

/** Normalize common local/KSA inputs to E.164 (+966…). */
export function normalizeE164Phone(raw: string): string {
  const compact = raw.replace(/[\s-]/g, '');
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00966')) return `+${compact.slice(2)}`;
  if (compact.startsWith('966')) return `+${compact}`;
  if (compact.startsWith('05') && compact.length === 10) {
    return `+966${compact.slice(1)}`;
  }
  if (compact.startsWith('5') && compact.length === 9) {
    return `+966${compact}`;
  }
  return compact.startsWith('+') ? compact : `+${compact}`;
}

export function isValidSaudiMobileE164(phone: string): boolean {
  return SAUDI_MOBILE_E164.test(phone);
}
