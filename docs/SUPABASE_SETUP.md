# WeSignal Supabase setup

This guide configures the existing WeSignal Cordova app and its additive Supabase schema. It does not reset tables or insert sample reports. Do not place a service-role key in the app.

## 1. Apply the migrations in order

In the Supabase Dashboard, open **SQL Editor → New query**. Apply each file below as a separate query, in this order. Run the next migration only after the previous one succeeds. In particular, let the category enum migration commit before applying the media migration; do not wrap these two migrations in one explicit transaction.

| Order | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20261016000000_initial_schema.sql` | Existing `profiles`, `reports`, status/category enums, ownership references, auth profile trigger, and private-report RLS. |
| 2 | `supabase/migrations/20261017000000_public_incidents.sql` | Existing `is_public` flag, published-report read policy, and private insert policy. |
| 3 | `supabase/migrations/20261018000000_report_category_taxonomy.sql` | Renames legacy enum labels in place and adds the remaining category values. Existing report rows are retained. |
| 4 | `supabase/migrations/20261018000001_report_media.sql` | Adds media metadata, private Storage bucket and policies, timestamp triggers, and the atomic authenticated submission RPC. |

If the first two migrations have already been applied to this project, **do not reapply them**; apply only orders 3 and 4. Keep a record of the applied versions if managing SQL manually. The two new migrations are written to be safely re-runnable where practical, but normal deployment should still apply each once in sequence.

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

The migration preserves existing rows and renames prior values in place: `roads` → `roads_infrastructure`, `waste` → `waste_sanitation`, `water` → `water_supply_leakage`, `power` → `electricity_power`, and `safety` → `crime_public_safety`. The original `reports.photo_path` column is intentionally retained and left untouched; the current app did not use it. New attachments use `report_media` and Storage objects.

## 2. Verify the media bucket

Migration 4 creates/configures the bucket. In **Storage → Buckets**, confirm:

- **Bucket ID/name:** `wesignal-report-media`
- **Visibility:** Private (`public = false`); do not make the bucket public.
- **Maximum file size:** 25 MiB (26,214,400 bytes per object).
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`, `video/mp4`, `video/webm`, `video/quicktime`, `video/3gpp`, and `video/x-m4v`.

The app permits at most three attachments per report, each no larger than 25 MiB. It uploads video using Supabase's resumable TUS endpoint in 6 MiB chunks. The bucket stays private; the app requests signed URLs valid for one hour only after the current RLS rules authorize the object read.

Do not add broad Storage policies such as “allow public read/write” or authenticated `UPDATE`. Migration 4 defines these boundaries:

- **INSERT:** authenticated upload only, under `<auth-user-uuid>/<report-uuid>/<random-uuid>.<extension>`.
- **SELECT:** an owner can read their own object; anonymous and signed-in readers can read an object only when its metadata belongs to a report currently marked public. An owner can also read their own private report media.
- **UPDATE:** no policy; the app uploads with upsert disabled.
- **DELETE:** authenticated owner only, and only while the object is not referenced by `report_media` (for safe cleanup of an interrupted submission).

The metadata table has RLS as well: anonymous users can select metadata only for published reports; users can select their own report metadata; only an authenticated report owner may attach metadata to their own private report; clients have no metadata update/delete grant. The submission RPC runs as the caller (not as a privileged definer), inserts a private report and its metadata in one database transaction, and uses `auth.uid()` for ownership.

## 3. Enable email authentication

In **Authentication → Sign In / Providers**, enable the Email provider and choose the confirmation behavior appropriate for your deployment. If email confirmation is enabled, users must follow the confirmation email before they can establish a usable session. Set the project's Site URL and any redirect allow-list entries to the real URL/deep-link callback used by your release. The app's public feed contains only explicitly published reports; this repository does not add a moderation/publishing UI.

## 4. Configure the app's public Supabase settings

Copy `www/env.js.example` to **`www/env.js`** and edit the copy:

```js
window.BINCOM_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY'
};
```

The app reads this file at runtime. `www/env.js` is ignored by Git. The root `.env.example` is only a reference and is **not** automatically loaded by the static/Cordova app. Configure the project URL and the public `anon`/publishable key in `www/env.js` before building or serving the app.

The anon/publishable key is designed to be present in a client app; RLS is the protection boundary. **Never put a `service_role` key, secret API key, database password, or JWT signing secret in `www/env.js`, another `www/` asset, or a mobile build.** If a privileged key has ever been committed or shipped, rotate it in Supabase.

The existing `config.xml` already allows the standard `https://*.supabase.co` project API and Storage/TUS hosts. If you use a custom Supabase domain, add its HTTPS origin to the Cordova `<access>` allow-list (and navigation allow-list if that host is opened as a top-level page) before building.

## 5. Data model and behavior

- `auth.users` → `public.profiles.id` (cascade), created by the existing auth-user trigger.
- `public.reports.reporter_id` references `auth.users.id` (`ON DELETE SET NULL`). New reports use the current authenticated user and `is_public = false`.
- `public.report_media.report_id` references `public.reports.id` (`ON DELETE CASCADE`). Each row records the private bucket, object path, image/video type, MIME type, byte size, order, and creation time.
- Reports remain private until an authorized backend/admin workflow changes `is_public`. Guests can browse only published reports and cannot submit.
- `submit_report_with_media` is executable only by `authenticated`; it inserts the report and metadata atomically. The app uploads the files first. If submission fails, it attempts to remove the now-unlinked objects. If the network outcome is uncertain, check **My Reports** before retrying to avoid a duplicate.
- The old `photo_path` column and all existing report rows are preserved. No storage object migration is attempted because this codebase had no active legacy upload path or known legacy bucket configuration.

## 6. Local checks and remaining live verification

From the repository root:

```bash
npm ci
npm run check
npx cordova requirements android
npm run build:android
```

A real authentication, report submission, TUS upload, RLS, and signed-URL check requires your Supabase project to be configured in `www/env.js`, migrations applied, and Email enabled. This repository/sandbox has no Supabase project URL or user credentials, so those live operations are not claimed as tested. After configuration, verify with one authenticated test account and non-sensitive test media, then confirm that (a) the submission appears in **My Reports** and is private, (b) it is absent from Explore until explicitly published, and (c) after authorized publication its image/video appears in Explore and details.

References: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals), [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [JavaScript signed URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls), and [Cordova Camera plugin](https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-camera/).
