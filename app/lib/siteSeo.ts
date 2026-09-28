import { BRAND_NAME_AR, BRAND_TAGLINE_AR } from '@/constants/brandCopy';
import { SARH_OFFICIAL_SITE } from '@/constants/sarhOfficial';

/**
 * Official web identity used by search engines (Google "site name" signals):
 * the document <title>, og:site_name, application-name and WebSite JSON-LD.
 * Without these, Google picks on-page text instead (it showed the onboarding
 * skip button «تخطي» as the site name).
 */
export const SITE_NAME = BRAND_NAME_AR;
export const SITE_ALTERNATE_NAME = 'Sarh';
export const SITE_URL = `${SARH_OFFICIAL_SITE}/`;
export const SITE_DESCRIPTION = BRAND_TAGLINE_AR;
export const SITE_THEME_COLOR = '#040C0E';

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: [SITE_ALTERNATE_NAME],
    url: SITE_URL,
    inLanguage: 'ar',
  };
}

/** JSON-LD safe to inline in a <script> tag. */
export function websiteJsonLdScript(): string {
  return JSON.stringify(websiteJsonLd()).replace(/</g, '\\u003c');
}
