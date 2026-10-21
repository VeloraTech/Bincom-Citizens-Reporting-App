# WeSignal

**See it. Report it. Improve it.** WeSignal is a Cordova-based Android app for reporting and browsing community incidents. Published reports and private media are backed by Supabase.

[![Latest release](https://img.shields.io/github/v/release/VeloraTech/Bincom-Citizens-Reporting-App?label=latest%20release)](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/releases)
[![Android release build](https://img.shields.io/github/actions/workflow/status/VeloraTech/Bincom-Citizens-Reporting-App/android-release.yml?label=Android%20release%20build)](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/actions/workflows/android-release.yml)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Cordova-1769E0)](https://cordova.apache.org/)

## Download

The latest preview is [WeSignal v0.1.19](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/releases/tag/v0.1.19). Its APK is debug-signed for sideload testing; it is not a Play Store release and does not use a stable production signing key. See [Releases](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/releases) for the APK and source archives.

## Demo

<!-- Add a YouTube, Vimeo, or other public demo-video URL here after recording. -->

**Video demo:** [Demo video](demo.gif)

<!-- Optional screenshots: add image files under docs/images/ and embed them here. -->

## What works

- Browse real published incidents, filter by category, and open incident details. Feed failures do not silently substitute sample reports.
- Create reports with title, category, description, optional location, and up to three image/video attachments. New submissions are published with the initial **Reported** status.
- Use the interactive map to place or adjust a pin, search for an address or landmark, or request the device’s current location. Address search and device GPS use separate services; the limits and known reliability caveats are below.
- Upload report media to a private Supabase Storage bucket. The app and database enforce ownership, private media access, a 25 MiB per-file limit, and a maximum of three attachments.
- Sign up and sign in with Supabase Auth, view an account dashboard, and edit or delete your own reports through the existing protected backend flows.
- Submit one community confirmation per authenticated user, except that the original reporter cannot confirm their own incident. Three distinct confirmations move a non-resolved incident to **Resolved**.
- Receive an in-app alert for newly published incidents while the app is running and connected. This is a foreground Realtime alert, not Android push notification delivery.
- Show loading, empty, offline, and error states without exposing local development URLs or falling back to fake incident data.

## Pending work and known limitations

- **Native Android push:** not implemented. Supabase remains the database/auth backend, but background or closed-app delivery needs a push provider such as Firebase Cloud Messaging (FCM) or a provider configured to deliver through Android push services.
- **Production signing:** the current APK is debug-signed. A stable Android release keystore and a signed production APK/AAB pipeline are not configured.
- **Location verification:** the current-location request now permits approximate/coarse location. The Android build passed, but no physical-device matrix test has been completed. Android API 31 and permission choices should be tested on-device.
- **Address-search availability:** the app currently calls Photon’s shared public demo service. It has no availability guarantee and can throttle or block extensive use. A managed geocoder with an SLA or a self-hosted instance is preferable if usage grows.
- **Map-tile availability:** the app currently uses the community-funded OpenStreetMap standard tile server. It is best-effort and may be blocked if use harms the service; it is not an offline-map provider.
- **Database change discipline:** production migrations must be reconciled against Supabase’s applied migration history and schema before deployment. Do not reset the production database or blindly apply historical migrations.

## External services and limits

The figures below distinguish provider limits from safeguards implemented in this client. Supabase Auth settings can be changed per project; verify the live values in the Supabase dashboard before a launch. The current WeSignal Supabase organization is on the Free plan.

| Service | Used for | Published limit or current behavior |
|---|---|---|
| [Photon public demo](https://photon.komoot.io/) | Address and landmark search | Photon publishes **no fixed numeric request quota** for its shared demo API. Its maintainers ask for reasonable use, warn that extensive use may be throttled or blocked, and provide no availability guarantee. WeSignal enforces at least **1 second between searches per running app instance**, requests at most **5 results**, and times out a search after **12 seconds**. This per-instance delay is not a global quota across users. |
| [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/) | Drawing the map background | No numeric per-app request allowance is published in the tile policy. Service is best-effort with no SLA. Attribution is required; clients must honor caching headers or cache for at least **7 days** if they cannot read them. Bulk downloads, prefetching, and offline tile downloads are not allowed on this server. |
| [Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits) | Sign-up, sign-in, email verification, and sessions | Documented defaults include **30 sign-up/sign-in/recovery requests per 5 minutes per IP** (burst capacity up to 30), **150 token requests per 5 minutes per IP**, and **30 verification requests per 5 minutes per IP**. Supabase’s built-in email sender is limited to **2 emails per hour per project**; custom SMTP has separate configurable limits. These are documented defaults, not a readback of this project’s current Auth settings. |
| [Supabase Realtime](https://supabase.com/docs/guides/realtime/limits) | Foreground alerts for new public incidents | Free-plan defaults: **200 concurrent connections**, **100 messages/second**, and **100 channel joins/second** per project. Limits are configurable and vary by plan. These are project capacity limits, not a per-user notification quota. |
| Supabase Data API and Storage | Reports, confirmation summaries, and private attachments | There is no single universal requests-per-second figure for all REST and Storage operations; performance and usage depend on project resources and plan. The app limits each attachment to **25 MiB** and each report to **3 attachments**. Supabase’s documented global file-size ceiling is up to **50 MB on Free** and up to **500 GB on Pro**, with bucket-level limits also applying; the app’s 25 MiB limit is stricter. |
| [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2) | Public Sans and Hanken Grotesk typography | The CSS API guide does not publish a numeric per-app request quota. If font files cannot be fetched, the app has system-font fallbacks. |
| GitHub Actions | Build tagged Android preview APKs as GitHub release drafts | Builds the APK after a valid merged tag; a maintainer must review and publish the draft. Usage allowances depend on the GitHub account/repository plan. This does not limit app users’ map or report requests. |

**Why location search may be intermittent:** address/landmark lookup goes through Photon’s shared public service, so network failures or upstream throttling are plausible; the current client does not record enough diagnostics to prove which occurred for an individual failed request. The current-location button instead uses the Android/Cordova geolocation plugin and does **not** call Photon. OpenStreetMap tiles are a third, separate service: tile failures affect the map background, not the coordinates returned by GPS or address search.

## Development setup

Requirements: Node.js 22, Java 17, Android SDK with the configured Android platforms/build tools, and a Cordova-compatible toolchain.

```bash
npm ci
npm run check
npx cordova requirements android
npm run build:android
```

For a browser preview, run `npm start`. Configure local public Supabase values by copying `www/env.js.example` to the ignored `www/env.js`; never put a service-role or secret key in the client.

## Supabase setup and security

Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) for the ordered schema migrations, private Storage setup, authentication callback, RLS overview, and public client-key configuration. Reconcile production migration history and schema before deploying. Reports and attachments rely on row-level security and protected owner actions; the report-media bucket must remain private.

## Releases

Android release tags use the format `vX.Y.Z`, must match the versions in `package.json` and `config.xml`, and must point to a commit already merged to `main`. Pushing a tag starts `.github/workflows/android-release.yml`, which runs checks, builds a debug APK, and creates a **draft GitHub release** with the APK. The workflow never publishes the release automatically; a maintainer reviews and publishes the draft manually. The APK is debug-signed for preview/testing and is not a production signing pipeline.
