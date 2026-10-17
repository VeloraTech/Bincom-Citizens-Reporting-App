# WeSignal App
A Cordova Android app for browsing published community incidents and securely reporting issues. This branch continues the existing Milestone 2 implementation without rebuilding the app.

## Milestone 2
- First-launch welcome with Get started / Skip and persisted completion.
- Public incident feed for guests and signed-in users, backed by Supabase `reports` rows where `is_public = true`.
- Category filtering, honest configuration/loading/empty/error states, incident details and back navigation.
- Real Supabase email/password sign-up, sign-in, sign-out, and session restoration.
- Guest report gate with Login/Create account actions; existing report validation and explicit location permission flow preserved.
- Canonical eleven-category taxonomy shared by reporting, filtering, feed cards, details, and the database enum.
- Optional image/video attachments using Cordova's native library picker (with browser file-input fallback), local previews, replacement/removal, and resumable private Supabase Storage uploads.
- Published Explore cards and details render stored image/video media using short-lived signed URLs; no public bucket or UI-only media placeholders.
- Secure additive migrations: public reads only for explicitly published rows; authenticated report inserts remain private and media/ownership are RLS-enforced.

## Local setup
Requirements: Node.js 22, Java 17, Android SDK/API 35, and a Cordova-compatible Android toolchain.
```bash
npm ci
npm run check
npx cordova platform add android --no-save
npx cordova requirements android
npm run build:android
```
For a browser preview: `npm start`

## Supabase setup
1. Create a Supabase project and enable email/password authentication.
2. Follow the complete ordered migrations, private Storage setup, RLS summary, and app-key instructions in [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Apply migrations 3 and 4 separately so the enum additions commit before the media migration.
3. Copy `www/env.js.example` to local-only `www/env.js`, then enter the public project URL and anon/publishable key. Never ship a service-role key.

To publish a real incident, an authorized backend/admin workflow must set `is_public = true`; the client deliberately has no moderation or publication control. If none are published, the app shows an honest empty state rather than sample content.

## Verification status
`npm run check` validates all app JavaScript modules. Browser smoke tests exercise media selection/preview, replacement/removal, category filters, feed/detail rendering, and responsive layout using isolated test fixtures. This repository does not contain a configured Supabase project or credentials, so live authentication, RLS, TUS uploads, and signed-URL reads require the deployer's setup and are not claimed as tested. The sandbox also lacks the Android JDK/SDK toolchain needed for a device build.

## Security and scope
No service-role key, local environment file, push notification, moderation UI, or unrelated milestone work is included. Anonymous writes and private report reads remain denied by RLS. Report media is stored in a private bucket; only owners and readers of explicitly published reports can obtain authorized media URLs. Do not merge or publish additional work without the repository's normal review workflow.

## WeSignal brand lock
The product name and exact tagline are locked as **WeSignal** — **See it. Report it. Improve it.** The user-facing onboarding, public feed header, auth/report flow, app label, status bar, and launch visual use a restrained white, near-black, and primary-blue system without changing the Cordova package ID or Supabase security model.

Brand assets are source-controlled at:
- `resources/icon-original.png` — unchanged original WeSignal icon supplied for this app.
- `resources/icon.svg` — SVG wrapper that references the supplied original artwork.
- `resources/splash.svg` — white launch artwork using the original icon and exact tagline.
- `resources/android/icon-512.png` — master raster launcher icon derived from the supplied artwork.
- `resources/android/icon/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/icon.png` — configured legacy Android launcher variants.
- `resources/android/adaptive/{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/{foreground,background}.png` — adaptive launcher layers.
- `tools/generate-icons.py` — deterministic Pillow script; regenerate with `python3 tools/generate-icons.py` after installing Pillow (`python3 -m pip install Pillow`).
