/** Official Sarh public identity — do not use alsfat.com / @alsfat.com. */
export const SARH_OFFICIAL_EMAIL = 'sarh@sarhsa.online';
export const SARH_OFFICIAL_SITE = 'https://sarhsa.online';
export const SARH_OFFICIAL_SITE_HOST = 'sarhsa.online';
/** Public store-join page (no app login required). */
export const SARH_STORE_JOIN_PATH = '/join';
export const SARH_STORE_JOIN_URL = `${SARH_OFFICIAL_SITE}${SARH_STORE_JOIN_PATH}`;
/** Existing butcher dashboard login. */
export const SARH_BUTCHER_LOGIN_PATH = '/butcher/login';
export const SARH_BUTCHER_LOGIN_URL = `${SARH_OFFICIAL_SITE}${SARH_BUTCHER_LOGIN_PATH}`;

export function sarhListingShareUrl(listingId: string): string {
  return `${SARH_OFFICIAL_SITE}/l/${listingId}`;
}

export function sarhProfileShareUrl(username: string): string {
  return `${SARH_OFFICIAL_SITE}/u/${username}`;
}
