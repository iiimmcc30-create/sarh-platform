/**
 * Fail-fast production environment validation.
 * Call before NestJS bootstrap in api / worker / socket entrypoints.
 * Never logs secret values — only missing key names.
 */

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

function isPlaceholderTwilioSid(sid: string): boolean {
  return (
    sid.startsWith('AC...') || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  );
}

function isNiMockKey(key: string | undefined): boolean {
  const k = key?.trim() ?? '';
  return !k || k.startsWith('test_') || k === 'change-me';
}

function collectMissing(keys: string[]): string[] {
  return keys.filter((key) => isBlank(process.env[key]));
}

/**
 * Validates production-critical env. Throws with a clear multi-line message.
 * No-op when NODE_ENV is not production (unit/e2e/local).
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  const problems: string[] = [];

  missing.push(
    ...collectMissing([
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_VERIFY_SERVICE_SID',
      'NI_BASE_URL',
      'NI_OUTLET_ID',
      'NI_API_KEY',
      'NI_WEBHOOK_SECRET',
      'APP_URL',
      'CRON_SECRET',
    ]),
  );

  const appUrl = process.env.APP_URL?.trim() ?? '';
  if (appUrl) {
    if (!/^https:\/\//i.test(appUrl)) {
      problems.push('APP_URL must be an https:// URL in production');
    }
    if (/railway\.app|onrender\.com/i.test(appUrl)) {
      problems.push(
        'APP_URL must not point at Railway/Render — use https://sarhsa.online',
      );
    }
  }

  const jwtSecret = process.env.JWT_SECRET?.trim() ?? '';
  const jwtRefresh = process.env.JWT_REFRESH_SECRET?.trim() ?? '';
  if (jwtSecret && jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }
  if (jwtRefresh && jwtRefresh.length < 32) {
    problems.push('JWT_REFRESH_SECRET must be at least 32 characters');
  }

  if (process.env.DEV_OTP === 'true') {
    problems.push('DEV_OTP=true is forbidden in production');
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  if (twilioSid && isPlaceholderTwilioSid(twilioSid)) {
    problems.push('TWILIO_ACCOUNT_SID looks like a placeholder');
  }

  if (isNiMockKey(process.env.NI_API_KEY)) {
    problems.push(
      'NI_API_KEY is missing or a mock/placeholder — real Network International credentials required',
    );
  }

  const redisEnabled = (process.env.REDIS_ENABLED || 'true').toLowerCase();
  if (redisEnabled !== 'false') {
    const hasRedis =
      !isBlank(process.env.REDIS_URL) || !isBlank(process.env.REDIS_HOST);
    if (!hasRedis) {
      missing.push('REDIS_URL or REDIS_HOST');
    }
  }

  const storage = (process.env.STORAGE_PROVIDER || '').toLowerCase();
  if (storage === 'cloudinary') {
    missing.push(
      ...collectMissing([
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ]),
    );
  } else if (storage === 's3') {
    missing.push(
      ...collectMissing(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']),
    );
    if (
      isBlank(process.env.AWS_S3_BUCKET) &&
      isBlank(process.env.AWS_BUCKET_NAME)
    ) {
      missing.push('AWS_S3_BUCKET');
    }
  } else if (isBlank(process.env.STORAGE_PROVIDER)) {
    missing.push('STORAGE_PROVIDER');
  } else if (storage === 'local') {
    problems.push(
      'STORAGE_PROVIDER=local is not allowed in production (use cloudinary or s3)',
    );
  }

  const uniqueMissing = [...new Set(missing)].filter(Boolean);
  if (uniqueMissing.length || problems.length) {
    const lines = [
      'Application startup validation failed.',
      ...(uniqueMissing.length
        ? [
            'Missing required environment variables:',
            ...uniqueMissing.map((k) => `- ${k}`),
          ]
        : []),
      ...(problems.length
        ? ['Configuration problems:', ...problems.map((p) => `- ${p}`)]
        : []),
      'Application startup aborted.',
    ];
    throw new Error(lines.join('\n'));
  }
}
