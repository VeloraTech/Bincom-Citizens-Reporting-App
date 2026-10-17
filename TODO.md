# Milestone 2 Outcomes

## Welcome and onboarding — complete
- [x] First-launch welcome explains public browsing and registered-user reporting, with Get started and Skip for now.
- [x] Onboarding completion persists in local storage; Skip goes directly to the feed.
- [x] Location permission is requested only after an explicit tap in the report form, with a landmark fallback.

## Public incident feed and details — complete in code, live backend pending
- [x] Guests and authenticated users can browse reports where `is_public = true` from the configured Supabase backend.
- [x] Category filtering, active state, reset, incident cards, details and back navigation are implemented.
- [x] Feed refreshes when users return to Explore; loading, empty, missing-configuration, backend error and retry states do not use fake reports.
- [x] Public report cards/details show authorized image/video media and optional coordinate/map-pin links.
- [ ] Apply the required migrations to a real Supabase project and verify live Explore data, Storage reads and signed URLs.

## Authentication and report gating — complete in code, live backend pending
- [x] Real email/password sign-up, sign-in, sign-out and session restoration use the existing Supabase client.
- [x] Guests see a Login/Create account gate when starting a report; the draft remains on screen and auth returns to report intent.
- [x] Auth validation, disabled/loading states, understandable errors and success feedback are implemented.
- [x] Guests cannot submit. Authenticated submissions are owner-scoped and automatically public only after the ordered publication migration is applied.
- [x] New reports stay in initial `submitted`/Reported-open status; no submission path marks a report resolved or grants client update/delete.
- [ ] Verify live authentication, submission, RLS and owner isolation against a configured Supabase project.

## Reporting media, taxonomy and Supabase setup — complete in code
- [x] Use the eleven canonical categories consistently across the report form, filters, feed, details and database enum; additive migration renames legacy enum labels without deleting report rows.
- [x] Cordova-compatible photo/video picker with browser fallback, previews, up to three files, replacement/removal, size/type validation and local error states.
- [x] Resumable TUS uploads target the private `wesignal-report-media` bucket; report and media metadata are written atomically through the authenticated submission RPC.
- [x] The private bucket, Storage RLS, report-media metadata policies, ownership constraints, indexes and submission/publication migrations are documented in order.
- [x] Frontend configuration uses only a public anon/publishable key; never place a service-role key or database secret in the app.
- [ ] Apply migrations 3–5 (if migrations 1–2 already exist) to the intended project and test live uploads/publication with non-sensitive test data.

## Location, status bar and Android — complete in code, device build pending
- [x] Optional Cordova geolocation with validated coordinate pairs, saved coordinate reads, OpenStreetMap pin links, and distinct denied/unavailable/timeout feedback.
- [x] Native GPS hardware is not mandatory; missing GPS can fall back to the available location provider or a landmark.
- [x] Android status bar is white with dark icons and does not overlay content; Explore account avatar retains a subtle blue ring.
- [x] `cordova prepare android` succeeds and adds native location permissions; local mobile smoke and static checks pass.
- [ ] Build/install and exercise the Android app on a machine/device with a complete JDK and Android SDK toolchain. The current sandbox has no `javac`, Android SDK/`ANDROID_HOME`, or Gradle.
