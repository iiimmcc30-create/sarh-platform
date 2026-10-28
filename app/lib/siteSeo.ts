import { SARH_OFFICIAL_SITE } from '@/constants/sarhOfficial';

/**
 * Official web identity used by search engines (Google "site name" signals):
 * the document <title>, og:site_name, application-name and WebSite JSON-LD.
 * Without these, Google picks on-page text instead (it showed the onboarding
 * skip button «تخطي» as the site name).
 */
/** Public Google/site name — brand + livestock for search intent. */
export const SITE_NAME = 'سرح للمواشي';
export const SITE_ALTERNATE_NAME = 'Sarh';
export const SITE_URL = `${SARH_OFFICIAL_SITE}/`;
export const SITE_DESCRIPTION =
  'سرح للمواشي — سوق المواشي والمجالس والبث المباشر في منصة واحدة';
export const SITE_THEME_COLOR = '#020202';

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: [SITE_ALTERNATE_NAME, 'سرح', 'Sarh Livestock'],
    url: SITE_URL,
    inLanguage: 'ar',
  };
}

/** JSON-LD safe to inline in a <script> tag. */
export function websiteJsonLdScript(): string {
  return JSON.stringify(websiteJsonLd()).replace(/</g, '\\u003c');
}
