/** Official Sarh public identity — do not use alsfat.com / @alsfat.com. */
export const SARH_OFFICIAL_EMAIL = 'sarh@sarhsa.online';
export const SARH_OFFICIAL_SITE = 'https://sarhsa.online';
export const SARH_OFFICIAL_SITE_HOST = 'sarhsa.online';

export function sarhListingShareUrl(listingId: string): string {
  return `${SARH_OFFICIAL_SITE}/l/${listingId}`;
}

export function sarhProfileShareUrl(username: string): string {
  return `${SARH_OFFICIAL_SITE}/u/${username}`;
}
