import { SARH_OFFICIAL_SITE } from '@/constants/sarhOfficial';

export function getAppOrigin(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }
  return SARH_OFFICIAL_SITE;
}

export function listingShareUrl(listingId: string): string {
  return `${getAppOrigin()}/l/${listingId}`;
}

export function userShareUrl(username: string): string {
  return `${getAppOrigin()}/u/${username}`;
}
