# WeSignal App
A Cordova Android app for browsing published community incidents and securely reporting issues. This branch implements **Milestone 2** on top of the merged Milestone 1 foundation.

## Milestone 2
- First-launch welcome with Get started / Skip and persisted completion.
- Public incident feed for guests and signed-in users, backed by Supabase `reports` rows where `is_public = true`.
- Category filtering, honest configuration/loading/empty/error states, incident details and back navigation.
- Real Supabase email/password sign-up, sign-in, sign-out, and session restoration.
- Guest report gate with Login/Create account actions; existing report validation and explicit location permission flow preserved.
- Secure additive migration: public reads only for explicitly published rows; client report inserts are always private and RLS-enforced.

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
2. Apply `supabase/migrations/20261016000000_initial_schema.sql`, then `supabase/migrations/20261017000000_public_incidents.sql`.
3. Create local-only `www/env.js` with the public project URL and anon key. Never ship a service-role key.

To publish a real incident, an authorized backend/admin workflow must set `is_public = true`; the client deliberately has no moderation or publication control. If none are published, the app shows an honest empty state rather than sample content.

## Verification status
`npm run check` validates JavaScript syntax. The Android workflow runs source checks, Cordova requirements, debug APK build, and artifact upload. This repository does not contain a configured Supabase project or credentials, so live auth/feed/report requests require the deployer's `www/env.js` and backend setup; missing configuration states are implemented and can be verified without credentials.

## Security and scope
No service-role key, local environment file, photo upload, push notification, moderation UI, or unrelated milestone work is included. Anonymous writes and private report reads remain denied by RLS. Do not merge or publish this branch without the repository's normal review workflow.

## WeSignal brand lock
The product name and exact tagline are locked as **WeSignal** — **See it. Report it. Improve it.** The user-facing onboarding, public feed header, auth/report flow, app label, status bar, and launch visual use the approved navy/blue system without changing the Cordova package ID or Supabase security model.

Brand assets are source-controlled at:
- `resources/icon.svg` — crisp vector source for the three rising forms and collective-action sweep.
- `resources/splash.svg` — branded launch artwork using the exact tagline.
- `resources/android/icon-512.png` — master raster launcher icon.
- `resources/android/icon/drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/icon.png` — configured Android density variants.
- `tools/generate-icons.py` — deterministic SVG-to-PNG generator used to create the raster variants.
