import { SetMetadata } from '@nestjs/common';
import type { RateLimitType } from '../services/rate-limit.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (type: RateLimitType = 'api') =>
  SetMetadata(RATE_LIMIT_KEY, type);

export const CRON_SECRET_KEY = 'cronSecret';
export const CronSecret = () => SetMetadata(CRON_SECRET_KEY, true);

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

export const RAW_BODY_KEY = 'rawBody';
export const RawBody = () => SetMetadata(RAW_BODY_KEY, true);
