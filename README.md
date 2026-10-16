# Bincom Citizens Reporting App

A Cordova Android foundation for transparent community issue reporting. This repository contains **Milestone 1 only**: the mobile shell, report-entry experience, Supabase data foundation, design documentation, and a reproducible Android debug build.

## What is included

- Cordova HTML/CSS/JS app in `www/` with dashboard, report form, and reports view.
- Optional Supabase browser client configuration through `www/env.js` (ignored) or runtime values.
- Safe, authenticated-only report RLS migration in `supabase/migrations/`.
- Android GitHub Actions workflow that runs source checks, verifies Cordova requirements, builds a debug APK, and uploads the APK/web bundle.
- Design system and interaction decisions in [`docs/design/DESIGN.md`](docs/design/DESIGN.md).

## Scope boundary

The app does not fabricate submitted reports, live civic data, staff workflows, notifications, or public moderation. Without a configured Supabase project and signed-in user, the UI stays in an explicit setup/empty state. Milestone 2 is intentionally not implemented.

## Local setup

Requirements: Node.js 22, Java 17, Android SDK/API 35, and a Cordova-compatible Android toolchain.

```bash
npm ci
npm run check
npx cordova platform add android --no-save
npx cordova requirements android
npm run build:android
```

For a browser preview:

```bash
npm start
```

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/20261016000000_initial_schema.sql` using the Supabase migration workflow.
3. Copy `.env.example` values into a local environment file and expose them to the web bundle as `www/env.js` (this file is ignored):

```js
window.BINCOM_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-public-anon-key'
};
```

Only the public anon key belongs in the app. Never ship a service-role key. Authentication and staff operations are intentionally outside this milestone.

## Repository conventions

- Keep secrets out of Git; `.env.example` contains placeholders only.
- Keep generated `platforms/` and `plugins/` out of Git; CI restores them from `package-lock.json`.
- Use feature branches and regular pushes; never force-push shared history.
- Keep product behavior honest: unavailable backend capabilities must be shown as unavailable, not simulated.
