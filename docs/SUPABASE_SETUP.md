# WeSignal Supabase setup

This guide configures the existing WeSignal Cordova app and its additive Supabase schema. It does not reset tables or insert sample reports. Do not place a service-role key in the app.

## 1. Apply the migrations in order

In the Supabase Dashboard, open **SQL Editor → New query**. Apply each file as a separate query, in this order. Run the next migration only after the previous one succeeds. In particular, the category enum migration must commit before the report-media migration; do not combine those migrations in an explicit transaction.

| Order | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20261016000000_initial_schema.sql` | Existing `profiles`, `reports`, category/status enums, ownership references, auth profile trigger, constraints, and baseline RLS. |
| 2 | `supabase/migrations/20261017000000_public_incidents.sql` | Existing `is_public` flag, public-read policy, and baseline authenticated-insert policy. |
| 3 | `supabase/migrations/20261018000000_report_category_taxonomy.sql` | Renames legacy enum labels in place and adds the remaining category values. Existing report rows are retained. |
| 4 | `supabase/migrations/20261018000001_report_media.sql` | Adds media metadata, a private Storage bucket and policies, timestamp triggers, and the authenticated atomic submission RPC. |
| 5 | `supabase/migrations/20261018000002_auto_publish_submissions.sql` | Publishes new authenticated submissions immediately in the initial `submitted` status; keeps existing rows and ownership protections intact. |
| 6 | `supabase/migrations/20261018000003_report_management.sql` | Adds owner-only edit/append-media RPCs. |
| 7 | `supabase/migrations/20261018000004_report_resolution_confirmations.sql` | Adds private per-user confirmations and an atomic RPC that resolves public reports after three distinct non-reporter confirmations. |
| 8 | `supabase/migrations/20261018000005_fix_report_media_policy_recursion.sql` | Replaces the recursive Storage-object existence check in the `report_media` INSERT policy with a narrowly scoped helper; preserves existing read and ownership checks. |
| 9 | `supabase/migrations/20261018000006_repair_launch_blocker_schema_drift.sql` | Idempotent forward repair for deployments missing the report confirmation counter or the non-recursive media INSERT policy. |
| 10 | `supabase/migrations/20261018000007_public_confirmation_summary.sql` | Adds a public-report-only RPC that counts persisted community confirmation rows and returns only the current caller's confirmation/reporter flags, not confirmer identities. |
| 11 | `supabase/migrations/20261018000008_public_incident_realtime_notifications.sql` | Adds public reports to Supabase Realtime for in-app alerts while a client is open and connected; existing report SELECT RLS remains in force. |
| 12 | `supabase/migrations/20261021000000_duplicate_incident_detection.sql` | Adds configurable, server-side possible-duplicate suggestions to authenticated submissions; reports are not merged. |
| 13 | `supabase/migrations/20261022084558_location_privacy_20261022.sql` | Moves precise locations behind owner RLS and exposes only category-aware approximate centers/radii to public feed, detail, and Realtime paths. Applied to WeSignal project `wztpwcuxwimzpgdwswba`. |
| 14 | `supabase/migrations/20261022084559_location_privacy_index_20261022.sql` | Adds the owner-lookup index for the protected precise-location RLS predicate. Applied to WeSignal project `wztpwcuxwimzpgdwswba`. |

If migrations 1 and 2 have already been applied, do not reapply them; apply only missing versions in order. Keep a record of applied versions if managing SQL manually. Before applying any migration that may have been run manually, reconcile actual effects with the Supabase migration ledger; never mark a version applied without verifying every effect. Do not reset production or delete existing data.

Five legacy production ledger IDs (`20261017182718`, `20261017183009`, `20261017183019`, `20261017195436`, `20261017200541`) predate the canonical migration timestamps and were applied in a different order. The matching `*_legacy_ledger_reconciliation.sql` files are intentionally no-op markers so the CLI recognizes those recorded IDs; canonical, idempotent migrations 7–11 remain in dependency order and reapply their verified effects. Do not replace these markers with copied historical SQL or reorder the canonical migrations.

Migration 11 enables a live in-app alert for a new public incident while WeSignal is open and connected. It is not Android push notification delivery and does not notify a device when the app is closed or offline; that requires a push provider, device registration, and credentials.

Migration 12 installs `pg_trgm`, creates a non-API-exposed `app_private` settings schema, and adds a serialized duplicate-check submission wrapper. Defaults are exact category, 24 hours, 500 m when both reports have coordinates, and title/description trigram similarity thresholds of 0.35/0.25. Adjust these values only as a database administrator by updating the single row in `app_private.duplicate_detection_settings`; its constraints bound valid settings and API roles cannot read or change it. If either report lacks coordinates, matching falls back to category, time, and text. Suggestions contain only already-public incident summaries, do not merge rows, do not alter statuses, and do not affect resolution confirmations. This migration was applied to WeSignal production by [Actions run 39557459900](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/actions/runs/39557459900). For another project, reconcile its migration history before applying. The CI pgTAP suite passed; a true two-session concurrency exercise remains a staging-only follow-up.

Migration 13 is documented in [`docs/LOCATION_PRIVACY.md`](LOCATION_PRIVACY.md). It is additive and preserves precise values in `report_private_locations` before scrubbing the legacy public columns. Public clients receive only a category-aware grid center, an explicit uncertainty radius, and a generic approximate-area label. Owners use `list_own_reports_with_private_locations()` for their own precise location workflow; public users and Realtime subscribers do not. It was applied to WeSignal through the connected Supabase integration and is recorded there as version `20261022084558`, name `location_privacy_20261022`.

The forward-repair migration is intended for a live project with the two confirmed symptoms: a missing `reports.resolution_confirmations` column and a recursive `report_media` INSERT policy. Before applying it, inspect the migration ledger and current schema/policies. It adds only the missing counter/constraint and replaces only the named INSERT policy using the scoped helper; it does not change report/media SELECT policies, disable RLS, or make the Storage bucket public. If earlier migrations are missing, reconcile and apply their missing effects in order rather than treating this repair as a substitute for the full schema history.

### Category values

The database enum and app use these exact values:

| User-facing label | Stored value |
|---|---|
| Waste & Sanitation | `waste_sanitation` |
| Water Supply & Leakage | `water_supply_leakage` |
| Electricity & Power | `electricity_power` |
| Flooding & Drainage | `flooding_drainage` |
| Roads & Infrastructure | `roads_infrastructure` |
| Traffic & Transportation | `traffic_transportation` |
| Accidents & Emergencies | `accidents_emergencies` |
| Crime & Public Safety | `crime_public_safety` |
| Civil Unrest & Rioting | `civil_unrest_rioting` |
| Environmental Hazards | `environmental_hazards` |
| Other | `other` |

The category migration preserves existing rows and renames prior values in place: `roads` → `roads_infrastructure`, `waste` → `waste_sanitation`, `water` → `water_supply_leakage`, `power` → `electricity_power`, and `safety` → `crime_public_safety`. The original `reports.photo_path` column is intentionally retained and left untouched; the current app did not use it. New attachments use `report_media` and Storage objects.

## 2. Verify the media bucket

Migration 4 creates/configures the bucket. In **Storage → Buckets**, confirm:

- **Bucket ID/name:** `wesignal-report-media`
- **Visibility:** Private (`public = false`); do not make the bucket public.
- **Maximum file size:** 25 MiB (26,214,400 bytes per object).
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`, `video/mp4`, `video/webm`, `video/quicktime`, `video/3gpp`, and `video/x-m4v`.

The app permits at most three attachments per report, each no larger than 25 MiB. It uploads video using Supabase's resumable TUS endpoint in 6 MiB chunks. The bucket remains private; the app requests signed URLs valid for one hour only after the current RLS rules authorize the object read.

Do not add broad Storage policies such as “allow public read/write” or authenticated `UPDATE`. Migration 4 defines these boundaries:

- **INSERT:** authenticated upload only, under `<auth-user-uuid>/<report-uuid>/<random-uuid>.<extension>`.
- **SELECT:** an owner can read their own object; anonymous and signed-in readers can read an object only when its metadata belongs to a report currently marked public. An owner can also read their own private report media.
- **UPDATE:** no policy; the app uploads with upsert disabled.
- **DELETE:** authenticated owner only, and only while the object is not referenced by `report_media` (for safe cleanup of an interrupted submission).

The metadata table has RLS as well: anonymous users can select metadata only for public reports; users can select their own report metadata; only an authenticated report owner may attach metadata to their own newly submitted report; clients have no metadata update/delete grant. The submission RPC runs as the caller (not as a privileged definer), inserts the report and metadata in one database transaction, and uses `auth.uid()` for ownership.

## 3. Enable email authentication and configure mobile redirects

In **Authentication → Sign In / Providers → Email**, enable email/password and keep **Confirm email** enabled. Do not disable confirmation to work around redirect problems; an unconfirmed signup must not receive an authenticated session.

In **Authentication → URL Configuration**, set the values below for this Cordova-only Android release:

- **Site URL:** `com.bincom.citizensreporting://auth/callback`
- **Redirect URLs / Additional Redirect URLs:** add the exact URL `com.bincom.citizensreporting://auth/callback`

The package ID `com.bincom.citizensreporting` is read from this project's `config.xml`; the custom URL-scheme plugin registers the lowercase scheme `com.bincom.citizensreporting`. The callback host and path are `auth/callback`. Do not use `http://localhost:3000` for Site URL or a production redirect. If the same Supabase project also serves a website, keep Site URL set to that website's real HTTPS URL and still add the exact mobile callback to the redirect allow-list; the app explicitly supplies its mobile `emailRedirectTo` during signup.

Leave Supabase's standard confirmation-email template using `{{ .ConfirmationURL }}` unless the template has been customized. If a custom template builds a redirect using `{{ .SiteURL }}`, replace its localhost value and use the redirect variable (`{{ .RedirectTo }}`) as described in Supabase's template guidance. Do not hard-code `localhost:3000` into the email template.

The app uses Supabase PKCE signup, passes `emailRedirectTo: 'com.bincom.citizensreporting://auth/callback'`, receives both cold-start and already-running Android links, and exchanges the returned code for a session. Confirmation-link errors return to the sign-in form with an error message; successful confirmation routes to Explore. Rebuild and reinstall the Android app after changing the scheme registration, then test with a new account and an actual confirmation email. The custom scheme does not require opening Chrome as part of normal map interaction.

Guests may browse public Explore reports but cannot submit. No moderation screen or broad anonymous write policy is added.

## 4. Configure the app's public Supabase settings

For local development, copy `www/env.js.example` to **`www/env.js`** and edit the copy:

```js
window.BINCOM_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY',
  authRedirectUrl: 'com.bincom.citizensreporting://auth/callback',
  mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapTileAttribution: '&copy; OpenStreetMap contributors',
  mapSearchEndpoint: 'https://photon.komoot.io/api/'
};
```

For Android builds, the existing workflow is `.github/workflows/android-build.yml`. In GitHub, open the repository **Settings → Secrets and variables → Actions → Variables → New repository variable** and add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The workflow also accepts `SUPABASE_ANON_KEY` instead of the publishable-key name. If you store these values as Actions secrets instead, use the same exact names. The URL/key are public client configuration; the workflow validates the key format and writes only the generated, Git-ignored `www/env.js`. It does not read or accept service-role/secret keys and does not print credential values. No extra GitHub variable is needed for the auth redirect because the mobile callback is derived from the inspected app configuration and is also shown in `www/env.js.example`.

Report and account deletion also require deploying `supabase/functions/account-actions` and setting its standard Supabase `SUPABASE_SERVICE_ROLE_KEY` secret. From the repository root, run `supabase functions deploy account-actions`, then set the project secret with `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY` or configure the same secret in the Supabase Dashboard. The service-role key must remain in the Edge Function environment and must never be added to the app. The function verifies the caller JWT, deletes associated Storage objects before report/account deletion, and refuses requests for another user. If the function is not deployed or the secret is missing, account deletion will fail with an Edge Function error; rebuilding the APK does not deploy or configure it.

The app reads this file at runtime. `www/env.js` is ignored by Git. The root `.env.example` is only a reference and is **not** automatically loaded by the static/Cordova app. Configure the project URL and the public `anon`/publishable key in `www/env.js` before building or serving the app.

The anon/publishable key is designed to be present in a client app; RLS is the protection boundary. **Never put a `service_role` key, secret API key, database password, or JWT signing secret in `www/env.js`, another `www/` asset, or a mobile build.** If a privileged key has ever been committed or shipped, rotate it in Supabase.

The existing `config.xml` allows `https://*.supabase.co`, the OSM tile host `https://tile.openstreetmap.org`, and the Photon search host `https://photon.komoot.io`; it also registers the custom URL-scheme plugin and appends a stable WeSignal User-Agent identifier to Cordova WebView requests. If you use a custom Supabase domain or replace a map provider, add that host's HTTPS origin to Cordova `<access>` before building. The optional map values are public provider endpoints, not credentials. The runtime file is ignored by Git, and the existing Android workflow generates it from the repository's public Supabase URL and anon/publishable key variables.

### In-app map provider notes

The report form and report/feed pin buttons open the locally bundled Leaflet map; tapping or dragging the marker selects coordinates, and the form's “Use my current location” action opens the same map centered on GPS after permission is granted. Search is an explicit user action, not autocomplete. The standard OSM attribution remains visible on the map, and Cordova appends `WeSignal/1.0.0` plus the repository URL to its WebView User-Agent. The OSM Foundation's standard tile server is best-effort, requires visible attribution and identifiable requests, and does not permit offline/prefetch downloads. Photon’s public demo permits reasonable project use but can throttle requests and has no availability guarantee. For production traffic, configure a service with suitable usage terms or self-host the providers, then set the matching public endpoints in `www/env.js` and allow-list their hosts in `config.xml`.

## 5. Data model and behavior

- `auth.users` → `public.profiles.id` (cascade), created by the existing auth-user trigger.
- `public.reports.reporter_id` references `auth.users.id` (`ON DELETE SET NULL`). The authenticated caller owns a new report; the UI displays the database's initial `submitted` status as **Reported**.
- `public.report_media.report_id` references `public.reports.id` (`ON DELETE CASCADE`). Each row records the private bucket, object path, image/video type, MIME type, byte size, order, and creation time.
- Migration 5 changes the `is_public` default for future reports and the submission RPC inserts `is_public = true`. A successful new report is therefore immediately visible in Explore, including its safe approximate location representation and authorized media. Precise coordinates are retained only in the owner-scoped location table after migration 13.
- New reports remain in `submitted`/Reported status; submission does **not** mark them resolved. Owners edit through the narrowly scoped `update_own_report` RPC; report/account deletion goes through the authenticated Edge Function so media is removed before rows. No authenticated table update/delete grant or public write policy is granted. Guests cannot submit.
- `submit_report_with_media` is executable only by `authenticated`; it inserts a caller-owned, public, initially-open report and its media metadata atomically. The app uploads files first. If submission fails, it attempts to remove unlinked objects. If the network outcome is uncertain, check **My Reports** before retrying to avoid a duplicate.
- The old `photo_path` column and all existing report rows are preserved. No storage-object migration is attempted because this codebase had no active legacy upload path or known legacy bucket configuration.

## 6. Local checks and remaining live verification

From the repository root:

```bash
npm ci
npm run check
npx cordova requirements android
npm run build:android
```

A real authentication, report submission, TUS upload, RLS, and signed-URL check requires your Supabase project to be configured in `www/env.js`, all five migrations applied, and Email enabled. This repository/sandbox has no Supabase project URL or user credentials, so those live operations are not claimed as tested. After configuration, verify with one authenticated test account and non-sensitive test media, then confirm that (a) a successful submission appears in **My Reports** and in Explore, (b) its status remains Reported/open, (c) its media and optional GPS pin appear in Explore/details, (d) a guest cannot submit, and (e) an unrelated user cannot edit or delete the report or its media.

## References


### Platform references for the mobile fixes

Cordova Camera v8 can return Android media as either `file://` or `content://`, and the granted URI may be temporary. WeSignal resolves the returned entry and normalizes the readable file to a MIME-typed Blob/File before preview or upload. [1] [2]

The mobile callback uses the Supabase PKCE redirect/code-exchange flow and the inspected Cordova custom-URL-scheme plugin contract. [3] [4] [5]

Leaflet provides the in-app touch map and pin interactions. The standard OSM tile service requires visible attribution and an identifiable app User-Agent, and Photon describes its public demo as reasonable-use/best-effort rather than a guaranteed production service. Cordova's `AppendUserAgent` preference supplies the WeSignal identifier. [6] [7] [8] [9]

Supabase's Storage access, private bucket, resumable upload and signed-URL guidance support the policy and upload setup in this guide. Cordova's Geolocation plugin provides the Android location API used by the app. [10] [11] [12] [13] [14]

[1]: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-camera/ "Apache Cordova Camera plugin"
[2]: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-file/ "Apache Cordova File plugin"
[3]: https://supabase.com/docs/guides/auth/native-mobile-deep-linking "Supabase native mobile deep linking"
[4]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase Auth redirect URLs"
[5]: https://github.com/EddyVerbruggen/Custom-URL-scheme "Cordova custom URL scheme plugin"
[6]: https://leafletjs.com/examples/quick-start/ "Leaflet quick start"
[7]: https://operations.osmfoundation.org/policies/tiles/ "OpenStreetMap tile usage policy"
[8]: https://github.com/komoot/photon "Photon public geocoder project"
[9]: https://cordova.apache.org/docs/en/latest/config_ref/ "Apache Cordova config.xml reference"
[10]: https://supabase.com/docs/guides/storage/security/access-control "Supabase Storage access control"
[11]: https://supabase.com/docs/guides/storage/buckets/fundamentals "Supabase Storage bucket fundamentals"
[12]: https://supabase.com/docs/guides/storage/uploads/resumable-uploads "Supabase resumable uploads"
[13]: https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls "Supabase JavaScript signed URLs"
[14]: https://github.com/apache/cordova-plugin-geolocation "Apache Cordova Geolocation plugin"


## 7. Safe migration-history reconciliation before automation

**WeSignal production was reconciled and deployed on 2026-10-21.** The checklist below is retained for any other target project or future migration-history drift; it is not a statement that the current WeSignal production deployment is pending. The successful [Actions run 39557459900](https://github.com/VeloraTech/Bincom-Citizens-Reporting-App/actions/runs/39557459900) applied the pending migrations and `account-actions` Edge Function without resetting the database, dropping tables, or deleting report rows. Supabase `db push` uses the CLI migration ledger; it is not a substitute for reconciling SQL that was previously pasted into the Dashboard.

1. Back up the project using your normal Supabase backup/PITR process and arrange a maintenance window. Do not run `db reset`, `migration repair`, or `db push` yet.
2. On a trusted workstation, install/update the Supabase CLI, authenticate with `supabase login`, and link the repository to the exact project (`supabase link --project-ref <project-ref>`). Enter the database password only in the CLI prompt. Do not paste it into chat, source files, terminal commands recorded by shell history, or Actions logs.
3. Inspect history with `supabase migration list --linked` and save the output privately. Record which repository versions appear in the **remote** history: `20261016000000`, `20261017000000`, `20261018000000` through `20261018000008`, and `20261021000000`. A version being absent means only that the ledger does not record it; it does not prove the SQL has not run.
4. Compare the live schema with the repository migrations using the CLI's linked-schema diff (`supabase db diff --linked --schema public`) and inspect the SQL output. Separately inspect the actual definitions in the Dashboard or via read-only catalog queries: enum labels (`public.report_category`, `public.report_status`), tables/columns/constraints/indexes, RLS enable/force flags and policies, grants, functions and their signatures/bodies, triggers, `storage.buckets` and `storage.objects` policies. Check that `report_media` has all columns from the migration (including `size_bytes`, `sort_order`, and `created_at`); its mere existence is insufficient. Confirm the private bucket settings and do not expose object names/data in shared logs.
5. For every unrecorded migration, classify it as **not applied**, **fully applied and effects verified**, or **partially applied/uncertain**. Verify all meaningful effects against the full migration, not just table existence. In particular, `20261018000000` renames enum labels and adds values; `20261018000001` creates media storage/table/policies and RPCs; the subsequent migrations alter publication behavior and report-management RPCs. Preserve existing rows. If any effect is partial, ambiguous, or differs, stop and get a DBA/Supabase specialist to prepare a forward-only repair migration; do not stamp it applied.
6. Only for a migration whose effects have been independently verified complete, and after a reviewed backup/checkpoint, use the Supabase CLI migration repair command to record that exact version as applied (or otherwise adopt the reviewed equivalent). Never repair/stamp a version merely to make `db push` pass. For SQL that is missing, prefer applying the original migration only after a staging rehearsal proves it is safe; for partial SQL, repair forward rather than blindly rerunning it. Keep a dated record of evidence and each repaired version.
7. Re-run `supabase migration list --linked`, inspect `supabase db diff --linked --schema public`, and confirm that history and schema agree. Rehearse the exact `supabase db push --linked` and Edge Function deployment on a staging project first. Enable the production workflow only after review and approval. Configure the GitHub `production` Environment with required reviewers to provide a deployment approval gate.

The duplicate-detection migration `20261021000000` is present in production, applied by the successful workflow run linked above. Its changes install the function/settings/helpers; the migration does not rewrite existing reports or report data.

## 8. GitHub Actions deployment configuration

Configure these under repository **Settings → Secrets and variables → Actions**. Prefer environment-scoped production credentials under **Environments → production → Environment secrets/variables**, and add required reviewers to that environment.

| Name | Type | Purpose |
|---|---|---|
| `SUPABASE_PROJECT_REF` | `production` environment variable (secret also accepted) | Exact project reference (not URL). |
| `SUPABASE_ACCESS_TOKEN` | `production` environment secret | Supabase CLI authentication for deployment. Use a dedicated token and rotate it; Supabase CLI access tokens may have broad account permissions, so restrict who can view/change this environment. |
| `SUPABASE_DB_PASSWORD` | `production` environment secret | Database password used only by `supabase link`/migration deployment; never log or expose it. |
| `SUPABASE_URL` | repository variable (or secret) | Public app endpoint used by APK builds. |
| `SUPABASE_PUBLISHABLE_KEY` | repository variable (or secret) | Public client key. `SUPABASE_ANON_KEY` is accepted as the legacy alternative. Never use a secret/service-role key here. |

`account-actions` must already have its runtime `SUPABASE_SERVICE_ROLE_KEY` configured as a Supabase Edge Function secret (Dashboard → Edge Functions → Secrets, or `supabase secrets set` from a trusted device). This key is **not** a GitHub Actions secret and is never passed to the app or deployment workflow. No separate GitHub service-role secret is needed. Keep any other function environment secrets in Supabase, not in repository files.

The workflow is serialized with a non-cancelling concurrency group and fails before deployment when required deployment settings are missing. SQL linting runs on pull requests in an ephemeral local Supabase stack and does not touch production. Production deployment is manual-only from `main`: the operator must explicitly confirm the migration-history/schema reconciliation input, then pass any required `production` Environment review. The Android APK build in the deployment workflow depends on successful migrations and Edge Function deployment. PR workflows validate/build but never deploy.

The deployment does not automatically configure the Edge Function's runtime secret. Before enabling it, verify in Supabase that the `account-actions` function has `SUPABASE_SERVICE_ROLE_KEY`; never print it or put it in GitHub Actions output. The migration workflow applies only pending versions according to Supabase's ledger; the reconciliation steps above are a prerequisite because some migrations may have been applied manually.
