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

If migrations 1 and 2 have already been applied, do not reapply them; apply only 3–6 in order. Keep a record of applied versions if managing SQL manually. Migrations 3–6 are additive and written to be safely re-runnable where practical, but normal deployment should apply each once in sequence.

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

Report and account deletion also require deploying `supabase/functions/account-actions` (for example, `supabase functions deploy account-actions`) and setting its standard Supabase `SUPABASE_SERVICE_ROLE_KEY` secret. The service-role key must remain in the Edge Function environment and must never be added to the app. The function verifies the caller JWT, deletes associated Storage objects before report/account deletion, and refuses requests for another user.

The app reads this file at runtime. `www/env.js` is ignored by Git. The root `.env.example` is only a reference and is **not** automatically loaded by the static/Cordova app. Configure the project URL and the public `anon`/publishable key in `www/env.js` before building or serving the app.

The anon/publishable key is designed to be present in a client app; RLS is the protection boundary. **Never put a `service_role` key, secret API key, database password, or JWT signing secret in `www/env.js`, another `www/` asset, or a mobile build.** If a privileged key has ever been committed or shipped, rotate it in Supabase.

The existing `config.xml` allows `https://*.supabase.co`, the OSM tile host `https://tile.openstreetmap.org`, and the Photon search host `https://photon.komoot.io`; it also registers the custom URL-scheme plugin and appends a stable WeSignal User-Agent identifier to Cordova WebView requests. If you use a custom Supabase domain or replace a map provider, add that host's HTTPS origin to Cordova `<access>` before building. The optional map values are public provider endpoints, not credentials. The runtime file is ignored by Git, and the existing Android workflow generates it from the repository's public Supabase URL and anon/publishable key variables.

### In-app map provider notes

The report form and report/feed pin buttons open the locally bundled Leaflet map; tapping or dragging the marker selects coordinates, and the form's “Use my current location” action opens the same map centered on GPS after permission is granted. Search is an explicit user action, not autocomplete. The standard OSM attribution remains visible on the map, and Cordova appends `WeSignal/1.0.0` plus the repository URL to its WebView User-Agent. The OSM Foundation's standard tile server is best-effort, requires visible attribution and identifiable requests, and does not permit offline/prefetch downloads. Photon’s public demo permits reasonable project use but can throttle requests and has no availability guarantee. For production traffic, configure a service with suitable usage terms or self-host the providers, then set the matching public endpoints in `www/env.js` and allow-list their hosts in `config.xml`.

## 5. Data model and behavior

- `auth.users` → `public.profiles.id` (cascade), created by the existing auth-user trigger.
- `public.reports.reporter_id` references `auth.users.id` (`ON DELETE SET NULL`). The authenticated caller owns a new report; the UI displays the database's initial `submitted` status as **Reported**.
- `public.report_media.report_id` references `public.reports.id` (`ON DELETE CASCADE`). Each row records the private bucket, object path, image/video type, MIME type, byte size, order, and creation time.
- Migration 5 changes the `is_public` default for future reports and the submission RPC inserts `is_public = true`. A successful new report is therefore immediately visible in Explore, including its optional GPS coordinates and authorized media. Existing rows are not rewritten: any report already marked private remains private until separately changed by an authorized workflow.
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
