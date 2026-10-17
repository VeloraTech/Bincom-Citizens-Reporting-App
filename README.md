# WeSignal App
A Cordova Android app for browsing published community incidents and securely reporting issues. This branch continues the existing Milestone 2 implementation without rebuilding the app.

## Milestone 2
- First-launch welcome with Get started / Skip and persisted completion.
- Public incident feed for guests and signed-in users, backed by Supabase `reports` rows where `is_public = true`.
- Category filtering, honest configuration/loading/empty/error states, incident details and back navigation.
- Real Supabase email/password sign-up, sign-in, sign-out, and session restoration.
- Guest report gate with Login/Create account actions; an embedded Leaflet map with draggable/tappable pins, explicit landmark/address search, optional GPS, and clear denied/unavailable/network states.
- Canonical eleven-category taxonomy shared by reporting, filtering, feed cards, details, and the database enum.
- Optional image/video attachments using Cordova's native library picker (with browser file-input fallback), Android URI/MIME normalization, local previews, replacement/removal, and resumable private Supabase Storage uploads.
- Published Explore cards and details render stored image/video media using short-lived signed URLs; no public bucket or UI-only media placeholders.
- Android status bar uses a white background and dark icons without overlaying app content; the account avatar control has a subtle blue ring.
- Secure additive migrations: new authenticated submissions are automatically published in the initial Reported/open status; public reads remain limited to public rows, and media/ownership are RLS-enforced.

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
1. Create a Supabase project and enable email/password authentication with email confirmation left enabled.
2. Follow the complete ordered migrations, private Storage setup, RLS summary, and app-key instructions in [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Reconcile production migration history and schema before deploying any unrecorded migration; do not reset production or stamp versions without verifying their effects.
3. Configure **Authentication → URL Configuration** with the exact Android callback `com.bincom.citizensreporting://auth/callback` and set the Site URL as described in the guide; never use `localhost:3000` in production.
4. Copy `www/env.js.example` to local-only `www/env.js`, then enter the public project URL and anon/publishable key. Never ship a service-role key. The existing GitHub Actions workflow creates this ignored file for Android CI builds.

After a successful authenticated submission, the report is visible in Explore with status `submitted` (displayed as **Reported**). Three distinct authenticated users other than the original reporter can confirm an incident; the backend resolves it on the third confirmation. Existing reports are not modified by this rule. Owner report editing/deletion uses the existing protected RPC/Edge Function flows; there is no moderation interface.

## Verification status
`npm run check` and the isolated mobile smoke test previously passed. A focused Android picker regression test now checks that the app bypasses Camera-plugin cache conversion, preserves selected JPEG/PNG/video bytes and MIME types, and logs no full URI. GitHub Actions run `39042379697` successfully logged applying the six existing migrations and deploying `account-actions`, then completed an Android debug build; this does not constitute a direct live schema/RLS audit. No physical-device reproduction of the failing upload has been performed. The new migration's pgTAP test and updated Android build run in PR CI; production deployment remains manual and requires migration-history/schema reconciliation.

## Security and scope
No service-role key is included in the client or source; it must remain in the Supabase Edge Function environment. No local environment file, push notification, moderation UI, or unrelated milestone work is included. Anonymous writes and unauthorized private-report reads remain denied by RLS. Report media is stored in a private bucket; only owners and readers of explicitly published reports can obtain authorized media URLs. Do not merge or deploy unreviewed changes.

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
