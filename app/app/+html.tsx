import { type PropsWithChildren } from 'react';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_THEME_COLOR,
  websiteJsonLdScript,
} from '@/lib/siteSeo';

/**
 * Static HTML shell for Expo web export.
 * Default Expo template is lang="en" with no dir — that leaves the whole
 * web app LTR even though Sarh is Arabic-first.
 *
 * Site-name metadata (application-name, og:site_name, WebSite JSON-LD) lives
 * here so every exported route carries it. The <title> itself is set via
 * expo-router/head in app/_layout.tsx (the static renderer owns <title>).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="theme-color" content={SITE_THEME_COLOR} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ar_SA" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: websiteJsonLdScript() }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
html, body, #root { height: 100%; }
body { margin: 0; overflow: hidden; direction: rtl; }
#root { display: flex; direction: rtl; }
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
