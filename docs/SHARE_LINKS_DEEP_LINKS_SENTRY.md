# Share links, link previews, deep links and Sentry

## Share links (`/l/:id`, `/u/:username`, `/post/:id`)
- The app shares `https://sarhsa.online/l/<listingId>`, `/u/<username>` and `/post/<postId>`
  (`app/constants/sarhOfficial.ts`, `app/lib/postInteractions.ts`).
- Expo routes `app/app/l/[id].tsx` (→ `/listing/[id]`) and `app/app/u/[username].tsx`
  (→ `/users/[id]` via `GET /api/users/by-username/:username`, falling back to the public
  user search on older API builds) resolve them on web and inside the app.

## Link previews (WhatsApp / X / Telegram …)
- `nginx/web-location.conf` sends known preview crawlers on `/l/…`, `/post/…`, `/u/…`
  to `GET /api/og/{l|post|u}/:key` (backend `src/share`), which returns a small HTML page
  with `og:title` / `og:description` / `og:image` (Cloudinary `w_1200,c_limit,q_auto,f_jpg`).
  People keep getting the web app. `nginx/ssl-redirect.conf` is untouched.
- Rollout: deploy the API (new endpoints, no migration), then recreate/reload nginx so the
  bind-mounted `web-location.conf` is picked up (`nginx -t` first).

## App Links / Universal Links
- `app/app.json`: `android.intentFilters` (autoVerify, https sarhsa.online + www, paths
  `/l/ /post/ /u/ /councils/join/`) and `ios.associatedDomains`. The committed
  `app/android/app/src/main/AndroidManifest.xml` carries the same intent-filter.
  **Needs a new native build** (EAS) — OTA cannot add these.
- Verification files are served by the web image from `app/public/.well-known/`
  (`nginx.web.conf` serves them as JSON). They contain placeholders that must be filled
  before links open the app directly:
  - `assetlinks.json` → `sha256_cert_fingerprints`: the **Play App Signing** SHA-256
    (Play Console → Setup → App integrity), plus the upload key SHA-256 if testing
    side-loaded builds (`eas credentials -p android`).
  - `apple-app-site-association` → `appIDs`: `<APPLE_TEAM_ID>.com.sarh.app`.
  Without real values the links still work; they just open in the browser.

## Sentry
- Backend: already wired (`backend-nest/src/shared/lib/sentry.ts`, `initialiseSentry()` in
  `main.ts`, global exception filter). It is disabled only because `SENTRY_DSN` is empty.
  To enable: create a Node.js project in Sentry, put its DSN in `/opt/sarh/.env.app`
  (`SENTRY_DSN=…`, never in git), then recreate `api`, `worker` and `socket`
  (`docker compose … up -d --no-deps api worker socket`). Logs print only the first
  30 characters of the DSN.
- App: not added. `@sentry/react-native` is a native module (needs an EAS build, the
  Sentry Expo plugin, a DSN as `EXPO_PUBLIC_SENTRY_DSN` and an auth token for source maps).
  Do it together with the next native build.
