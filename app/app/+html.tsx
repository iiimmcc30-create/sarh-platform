import { type PropsWithChildren } from 'react';

/**
 * Static HTML shell for Expo web export.
 * Default Expo template is lang="en" with no dir — that leaves the whole
 * web app LTR even though Sarh is Arabic-first.
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
