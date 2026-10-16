# Milestone 2 Outcomes

## Welcome and onboarding — complete
- [x] First-launch welcome explains public browsing and registered-user reporting, with Get started and Skip for now.
- [x] Onboarding completion persists in local storage; Skip goes directly to the feed.
- [x] Location permission is requested only from the report form after an explicit tap, with a landmark fallback.

## Public incident feed and details — complete in code, live backend pending
- [x] Guests and authenticated users can browse published/public incidents from the configured Supabase backend.
- [x] Category filtering, active state, reset, incident cards, details and back navigation are implemented.
- [x] Loading skeleton, honest empty, missing-configuration, backend error and retry states are implemented without mock content.
- [ ] Apply the additive migration to a real Supabase project and publish authorized rows before live feed data can appear.

## Authentication and report gating — complete in code, live backend pending
- [x] Real email/password sign-up, sign-in, sign-out, and session restoration use the existing Supabase client.
- [x] Guests see a Login/Create account gate when starting a report; the draft remains on screen and auth returns to report intent.
- [x] Auth validation, disabled/loading states, understandable errors, and success feedback are implemented.
- [x] The client adapter checks session and forces `is_public: false`; database RLS migration enforces the same boundary.
- [ ] Verify live auth and submission against a correctly configured Supabase project.

## Existing report flow and delivery — complete in code
- [x] Milestone 1 report validation, fields, and explicit geolocation flow are preserved.
- [x] Additive public visibility migration and documentation are included.
- [x] JavaScript syntax, diff hygiene, bundle serving, and tracked-file secret scan completed.
- [ ] Android debug APK: blocked in this sandbox because Java JDK, Android SDK, and Gradle are unavailable.
