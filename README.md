# Bincom Citizens Reporting App

A Cordova Android foundation for transparent community issue reporting. This repository contains **Milestone 1 only**: the mobile shell, authenticated report-entry experience, Supabase data foundation, design documentation, and a reproducible Android debug build.

## Implemented in Milestone 1

- Cordova HTML/CSS/JS app in `www/` with dashboard, account, report form, and private reports view.
- Supabase email/password sign-up, sign-in, persistent session state, and sign-out.
- Clear setup messaging when `www/env.js` or Supabase configuration is missing; the app never fabricates a successful report.
- Supabase `profiles` table linked to `auth.users` with own-profile RLS and automatic profile creation on sign-up.
- Private report RLS: authenticated users can insert only their own reports and read only their own records. Anonymous writes, client-side report updates, and broad public reads are denied.
- Android GitHub Actions workflow using supported SDK packages (`platform-tools`, `platforms;android-34`, and `build-tools;34.0.0`), source checks, Cordova requirements verification, debug APK build, and artifact upload.
- Design system and interaction decisions in [`docs/design/DESIGN.md`](docs/design/DESIGN.md).

## Scope boundary

The app does not fabricate submitted reports, live civic data, staff workflows, public report publication, notifications, photo upload, or public moderation. Reports remain private to the signed-in reporter in Milestone 1. Without a configured Supabase project and signed-in user, submission and private report viewing remain unavailable. Later milestones are intentionally not implemented.

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
2. Enable email/password authentication in the Supabase dashboard.
3. Apply `supabase/migrations/20261016000000_initial_schema.sql` using the Supabase migration workflow.
4. Copy `.env.example` values into a local environment file and expose them to the web bundle as `www/env.js` (this file is ignored):

```js
window.BINCOM_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-public-anon-key'
};
```

Only the public anon key belongs in the app. Never ship a service-role key. Email confirmation may be required by the Supabase project settings; after sign-up, follow the confirmation email before signing in.

## Repository conventions

- Keep secrets out of Git; `.env.example` contains placeholders only.
- Keep generated `platforms/` and `plugins/` out of Git; CI restores them from `package-lock.json`.
- Use feature branches and regular fast-forward pushes; never force-push shared history.
- Keep product behavior honest: unavailable backend capabilities must be shown as unavailable, not simulated.
