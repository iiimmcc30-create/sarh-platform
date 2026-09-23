const SECRET_KEYS = [
  'authorization',
  'apiKey',
  'api_key',
  'access_token',
  'accessToken',
  'client_secret',
  'clientSecret',
  'password',
  'secret',
  'NI_API_KEY',
  'NI_BASIC_AUTH',
  'NI_WEBHOOK_SECRET',
  'APIKEY',
  'apikey',
  'ciphertext',
];

function maskValue(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function redactSensitive(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('Bearer ') || value.startsWith('Basic ')) {
      return `${value.split(' ')[0]} ***`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        SECRET_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))
      ) {
        out[key] = typeof nested === 'string' ? maskValue(nested) : '***';
      } else {
        out[key] = redactSensitive(nested);
      }
    }
    return out;
  }
  return value;
}

export function maskEmail(
  email: string | undefined | null,
): string | undefined {
  if (!email?.trim()) return undefined;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}
