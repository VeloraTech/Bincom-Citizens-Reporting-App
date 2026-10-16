# Milestone 2 Plan — Welcome, Public Incidents, Authentication

## Scope and implementation approach
Continue the existing Cordova + static HTML/CSS/JavaScript + Supabase project. Keep `www/index.html` as the single mobile shell, use small screen sections with hash-free in-app navigation, and preserve the existing report form fields and geolocation handling. Add a first-launch onboarding flag in `localStorage`, public incident browsing through a read-only Supabase adapter, and real Supabase email/password auth with session restoration.

The schema change is intentionally minimal: add `is_public boolean not null default false` to `public.reports`; allow anonymous and authenticated users to read only rows where `is_public = true`; keep authenticated inserts constrained to the current user and force newly inserted reports private. No service-role key, moderation UI, or private-data exposure is added.

## Project structure
- `www/index.html`: mobile shell, onboarding, feed, detail, auth, report and private-report screens.
- `www/css/app.css`: white/blue civic visual system, responsive mobile layout, loading/error/empty states, focus and reduced-motion styles.
- `www/js/supabase.js`: runtime configuration and least-privilege data/auth adapter.
- `www/js/app.js`: screen state, onboarding persistence, feed filtering/detail rendering, auth, report gating and preserved Milestone 1 report submission.
- `supabase/migrations/20261017000000_public_incidents.sql`: additive visibility column and RLS policy/grant changes.
- `docs/design/DESIGN.md`: updated visual direction and interaction rules.
- `README.md`: setup, SQL, verification and limitations.

## Design
**Civic signal / 0.06 probability.** A calm, high-contrast civic service with editorial spacing and one clear action per view.

- **Design Movement:** Civic signal — trustworthy public-service information with a precise blue accent.
- **Core Principles:** open by default for browsing; clear next action; honest backend state; accessible touch-first interactions.
- **Color Philosophy:** deep ink for authority, bright blue for action and links, soft blue for supporting surfaces, near-white background for calm and legibility.
- **Layout Paradigm:** stacked feed with a persistent bottom action rail and a compact context header rather than a dashboard grid.
- **Signature Elements:** blue “signal” rule, compact category/status pills, incident cards with a left accent edge.
- **Interaction Philosophy:** browsing never requires auth; report intent is preserved through a visible auth gate; every async operation has a designed state.
- **Animation:** 180ms ease-out entrance/press transitions; no looping motion; honor `prefers-reduced-motion`.
- **Typography System:** system sans-serif; 30px display title, 24px section title, 16px card title, 14–16px body, 12px metadata.
- **Brand Essence:** WeSignal is a clear public window into community issues and a secure way for residents to submit one; trustworthy, direct, neighborly.
- **Brand Voice:** “See what your community is tracking.” / “An account keeps your report connected to you.”
- **Wordmark & Logo:** use the original WeSignal icon image supplied for this project; preserve its artwork and proportions in launcher and splash assets.
- **Signature Brand Color:** `#1769E0` primary blue.

## Security and data rules
- Public feed selects only `is_public = true` rows and only non-sensitive display columns.
- Anonymous users cannot insert, update or delete reports.
- Authenticated report insert always sends `is_public: false`; database policy also enforces it.
- Missing configuration, empty backend, and backend errors are explicit and never replaced with mock content.
