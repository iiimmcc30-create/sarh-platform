/** Same Saudi local → E.164 rules the mobile login screen uses before POST /auth/login. */
export function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const compact = trimmed.replace(/[\s-]/g, '');
  const digitsOnly = compact.replace(/^\+/, '').replace(/\D/g, '');
  const looksLikePhone =
    /^[+0-9]/.test(compact) && compact.replace(/[\s-]/g, '').replace(/[0-9+]/g, '').length === 0;

  if (!looksLikePhone) return trimmed;

  if (compact.startsWith('+966') && digitsOnly.length >= 12) return `+${digitsOnly}`;
  if (compact.startsWith('00966')) return `+${compact.slice(2)}`;
  if (compact.startsWith('966') && digitsOnly.length >= 12) return `+${digitsOnly}`;
  if (compact.startsWith('05') && compact.length === 10) return `+966${compact.slice(1)}`;
  if (compact.startsWith('5') && compact.length === 9) return `+966${compact}`;

  return trimmed;
}
